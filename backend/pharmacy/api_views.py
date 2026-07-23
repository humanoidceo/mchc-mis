from datetime import datetime, timedelta
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from django.http import HttpResponse
from django.db import transaction
from django.db.models import Count, Prefetch, Q, Sum
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.access import user_has_permission
from accounts.permissions import Role
from accounts.trash import cleanup_expired_trash, soft_delete_instance
from clinic.models import ClinicalDocument, Patient, Payment
from clinic.serializers import ClinicalDocumentSerializer
from config.pagination import StandardResultsSetPagination

from .models import Medicine, PharmacySetting, Sale, SaleItem, money, sync_medicine_profit_percentages
from .serializers import (
    PharmacyDashboardSerializer,
    PharmacyFamilyPlanningOrderSerializer,
    PharmacyMedicineSerializer,
    PharmacyPatientSearchSerializer,
    PharmacyPrescriptionSerializer,
    PharmacyRutfOrderSerializer,
    PharmacySaleCreateSerializer,
    PharmacySaleSerializer,
    PharmacySettingSerializer,
)


def month_start_after(source_date, months: int):
    month_index = (source_date.month - 1) + months
    year = source_date.year + (month_index // 12)
    month = (month_index % 12) + 1
    return source_date.replace(year=year, month=month, day=1)


def is_pharmacy_user(user) -> bool:
    profile = getattr(user, "staff_profile", None)
    role = getattr(profile, "role", None)
    return bool(
        user
        and user.is_authenticated
        and (
            user.is_superuser
            or role in {Role.SUPER_ADMIN, Role.PHARMACIST}
            or user_has_permission(user, "stock.manage")
            or user_has_permission(user, "documents.medicine_bill.create")
        )
    )


class PharmacyBaseViewSet(viewsets.GenericViewSet):
    permission_classes = (IsAuthenticated,)

    def check_permissions(self, request):
        cleanup_expired_trash()
        super().check_permissions(request)
        if not is_pharmacy_user(request.user):
            self.permission_denied(request, message="Only pharmacist accounts can access pharmacy APIs.")


class PharmacyFamilyPlanningOrderPagination(StandardResultsSetPagination):
    page_size = 5
    max_page_size = 5


def next_patient_registration_number() -> str:
    numeric_registration_numbers = [
        int(registration_number)
        for registration_number in Patient.all_objects.select_for_update().values_list("registration_number", flat=True)
        if registration_number.isdigit()
    ]
    return str(max(numeric_registration_numbers, default=0) + 1)


def match_pharmacy_medicine(pharmacist, medicine_name: str):
    if not medicine_name:
        return None
    medicine = Medicine.objects.filter(pharmacist=pharmacist, name__iexact=medicine_name).first()
    if medicine:
        return medicine
    return Medicine.objects.filter(pharmacist=pharmacist, generic_name__iexact=medicine_name).first()


def match_rutf_medicine(pharmacist):
    return (
        Medicine.objects.filter(pharmacist=pharmacist)
        .filter(Q(name__icontains="rutf") | Q(generic_name__icontains="rutf"))
        .order_by("expiry_date", "name")
        .first()
    )


def match_family_planning_medicine(pharmacist, medicine_id: int):
    return (
        Medicine.objects.filter(
            pharmacist=pharmacist,
            pk=medicine_id,
            generic_name__iexact="Family Planning",
        )
        .order_by("expiry_date", "name")
        .first()
    )


def family_planning_items_from_payload(payload) -> list[tuple[int, int]]:
    if not isinstance(payload, dict):
        raise serializers.ValidationError({"payload": "Invalid family planning payload."})
    items = payload.get("items")
    if not isinstance(items, list) or not items:
        raise serializers.ValidationError({"payload": "No family planning items were found in this order."})

    normalized_items: list[tuple[int, int]] = []
    for item in items:
        if not isinstance(item, dict):
            raise serializers.ValidationError({"payload": "Invalid family planning order item."})
        medicine_id = item.get("medicine")
        try:
            quantity = int(item.get("quantity") or 0)
        except (TypeError, ValueError):
            quantity = 0
        if not isinstance(medicine_id, int) or quantity <= 0:
            raise serializers.ValidationError({"payload": "Each family planning item must include a valid medicine and quantity."})
        normalized_items.append((medicine_id, quantity))
    return normalized_items


def lock_family_planning_medicines(pharmacist, item_rows: list[tuple[int, int]]) -> dict[int, Medicine]:
    medicine_ids = [medicine_id for medicine_id, _quantity in item_rows]
    medicines = {
        medicine.id: medicine
        for medicine in Medicine.objects.select_for_update().filter(
            pharmacist=pharmacist,
            pk__in=medicine_ids,
            generic_name__iexact="Family Planning",
        )
    }
    for medicine_id, _quantity in item_rows:
        if medicine_id not in medicines:
            raise serializers.ValidationError({"medicine": f"Family planning stock item #{medicine_id} was not found."})
    return medicines


def restore_family_planning_stock(pharmacist, payload) -> None:
    item_rows = family_planning_items_from_payload(payload)
    medicines = lock_family_planning_medicines(pharmacist, item_rows)
    for medicine_id, quantity in item_rows:
        medicine = medicines[medicine_id]
        medicine.quantity += quantity
        medicine.save(update_fields=["quantity", "sell_price", "updated_at"])


def deduct_family_planning_stock(pharmacist, payload) -> None:
    item_rows = family_planning_items_from_payload(payload)
    medicines = lock_family_planning_medicines(pharmacist, item_rows)
    for medicine_id, quantity in item_rows:
        medicine = medicines[medicine_id]
        if quantity > medicine.quantity:
            raise serializers.ValidationError({"medicine": f"Only {medicine.quantity} available for {medicine.name}."})
    for medicine_id, quantity in item_rows:
        medicine = medicines[medicine_id]
        medicine.quantity -= quantity
        medicine.save(update_fields=["quantity", "sell_price", "updated_at"])


def latest_prescription_for_patient(patient_id: int):
    return (
        ClinicalDocument.objects.filter(
            patient_id=patient_id,
            document_type=ClinicalDocument.DocumentType.PRESCRIPTION,
        )
        .select_related("patient")
        .order_by("-created_at")
        .first()
    )


def dashboard_period_start(period: str):
    now = timezone.localtime(timezone.now())
    if period == "annual":
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0), "Annual"
    if period == "monthly":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), "Monthly"
    if period == "weekly":
        start = now - timedelta(days=now.weekday())
        return start.replace(hour=0, minute=0, second=0, microsecond=0), "Weekly"
    return now.replace(hour=0, minute=0, second=0, microsecond=0), "Daily"


def resolve_dashboard_period(period: str, from_date_raw: str, to_date_raw: str):
    if period == "custom":
        start_date = parse_date(from_date_raw)
        end_date = parse_date(to_date_raw)
        errors: dict[str, str] = {}
        if start_date is None:
            errors["from"] = "Select a valid from date."
        if end_date is None:
            errors["to"] = "Select a valid to date."
        if errors:
            raise serializers.ValidationError(errors)
        if end_date < start_date:
            raise serializers.ValidationError({"to": "To date must be on or after from date."})

        current_timezone = timezone.get_current_timezone()
        start_at = timezone.make_aware(datetime.combine(start_date, datetime.min.time()), current_timezone)
        end_at = timezone.make_aware(datetime.combine(end_date + timedelta(days=1), datetime.min.time()), current_timezone)
        return start_at, end_at, f"Custom ({start_date.isoformat()} to {end_date.isoformat()})"

    start_at, period_label = dashboard_period_start(period)
    return start_at, None, period_label


def build_patient_trend(period: str, sales_queryset):
    now = timezone.localtime(timezone.now())

    if period == "annual":
        month_rows = (
            sales_queryset
            .annotate(bucket=TruncMonth("created_at"))
            .values("bucket")
            .annotate(value=Count("patient", distinct=True))
            .order_by("bucket")
        )
        counts = {row["bucket"].month: row["value"] for row in month_rows if row["bucket"] is not None}
        return [
            {"label": month_label, "value": counts.get(index, 0)}
            for index, month_label in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1)
        ]

    if period == "weekly":
        start = now - timedelta(days=now.weekday())
        bucket_count = 7
        labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    elif period == "monthly":
        start = now.replace(day=1)
        bucket_count = now.day
        labels = None
    else:
        return []

    start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    day_rows = (
        sales_queryset
        .annotate(bucket=TruncDate("created_at"))
        .values("bucket")
        .annotate(value=Count("patient", distinct=True))
        .order_by("bucket")
    )
    counts = {row["bucket"]: row["value"] for row in day_rows if row["bucket"] is not None}
    return [
        {
            "label": labels[index] if labels else str((start + timedelta(days=index)).day),
            "value": counts.get((start + timedelta(days=index)).date(), 0),
        }
        for index in range(bucket_count)
    ]


def serialize_prescription_items(pharmacist, prescription: ClinicalDocument):
    items = prescription.payload.get("items") if isinstance(prescription.payload, dict) else []
    rows = []
    for item in items if isinstance(items, list) else []:
        medicine_name = str(item.get("medicine_name") or item.get("medicine") or "").strip()
        matched_medicine = match_pharmacy_medicine(pharmacist, medicine_name)
        rows.append(
            {
                "medicine": item.get("medicine") if isinstance(item.get("medicine"), int) else None,
                "medicine_name": medicine_name,
                "quantity": str(item.get("quantity", "")),
                "instructions": str(item.get("instructions", "")),
                "pharmacy_medicine": matched_medicine.id if matched_medicine else None,
                "pharmacy_medicine_name": matched_medicine.name if matched_medicine else "",
                "pharmacy_stock": matched_medicine.quantity if matched_medicine else 0,
                "pharmacy_sell_price": matched_medicine.sell_price if matched_medicine else Decimal("0.00"),
                "matched": bool(matched_medicine),
            }
        )
    return rows


def sale_item_cost_price(item, default_profit_percentage: Decimal):
    if getattr(item, "medicine", None) is not None:
        return item.medicine.buy_price

    divisor = Decimal("1.00") + (default_profit_percentage / Decimal("100"))
    if divisor <= 0:
        return item.unit_price
    return money(item.unit_price / divisor)


def summarize_sales(sales_queryset, default_profit_percentage: Decimal):
    internal_amount = Decimal("0.00")
    external_amount = Decimal("0.00")
    total_billed = Decimal("0.00")
    sold_quantity = Decimal("0.00")
    sold_medicines_price = Decimal("0.00")

    for sale in sales_queryset:
        sale_total = sale.total_amount
        total_billed += sale_total
        if sale.customer_type == Sale.CustomerType.INTERNAL:
            internal_amount += sale_total
        else:
            external_amount += sale_total
        for item in sale.items.all():
            sold_quantity += item.quantity
            sold_medicines_price += money(sale_item_cost_price(item, default_profit_percentage) * item.quantity)

    sold_medicines_price = money(sold_medicines_price)
    sold_medicines_profit = money(total_billed - sold_medicines_price)
    return {
        "internal_amount": money(internal_amount),
        "external_amount": money(external_amount),
        "total_billed": money(total_billed),
        "sold_quantity": sold_quantity,
        "sold_medicines_price": sold_medicines_price,
        "sold_medicines_profit": sold_medicines_profit,
    }


def summarize_inventory(medicines_queryset):
    available_medicines_count = 0
    stock_units = Decimal("0.00")
    inventory_value_cost = Decimal("0.00")
    inventory_value_sale = Decimal("0.00")

    for medicine in medicines_queryset:
        if medicine.quantity > 0:
            available_medicines_count += 1
            stock_units += medicine.quantity
            inventory_value_cost += medicine.buy_price * medicine.quantity
            inventory_value_sale += medicine.sell_price * medicine.quantity

    return {
        "available_medicines_count": available_medicines_count,
        "stock_units": stock_units,
        "inventory_value_cost": money(inventory_value_cost),
        "inventory_value_sale": money(inventory_value_sale),
    }


def build_inline_string_cell(cell_reference: str, value: str, style_index: int | None = None) -> str:
    style_attribute = f' s="{style_index}"' if style_index is not None else ""
    return (
        f'<c r="{cell_reference}" t="inlineStr"{style_attribute}>'
        f"<is><t>{escape(value)}</t></is>"
        "</c>"
    )


def build_number_cell(cell_reference: str, value: Decimal | int | float, style_index: int | None = None) -> str:
    style_attribute = f' s="{style_index}"' if style_index is not None else ""
    if isinstance(value, Decimal):
        numeric_value = format(value, "f")
    else:
        numeric_value = str(value)
    return f'<c r="{cell_reference}"{style_attribute}><v>{numeric_value}</v></c>'


def build_xlsx_workbook(worksheet_name: str, rows: list[list[object]]) -> bytes:
    safe_sheet_name = "".join(character for character in worksheet_name if character not in '\\/*?:[]')[:31] or "Sheet1"
    sheet_rows: list[str] = []

    for row_index, row in enumerate(rows, start=1):
        cells: list[str] = []
        for column_index, value in enumerate(row, start=1):
            cell_reference = f"{chr(64 + column_index)}{row_index}"
            style_index = 1 if row_index == 1 else None
            if isinstance(value, (Decimal, int, float)) and not isinstance(value, bool):
                cells.append(build_number_cell(cell_reference, value, style_index))
            else:
                cells.append(build_inline_string_cell(cell_reference, "" if value is None else str(value), style_index))
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')

    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        "<sheetData>"
        f'{"".join(sheet_rows)}'
        "</sheetData>"
        "</worksheet>"
    )
    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        "<sheets>"
        f'<sheet name="{escape(safe_sheet_name)}" sheetId="1" r:id="rId1"/>'
        "</sheets>"
        "</workbook>"
    )
    workbook_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        "</Relationships>"
    )
    styles_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2">'
        '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'
        '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>'
        "</fonts>"
        '<fills count="2">'
        '<fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
        "</fills>"
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="2">'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        "</cellXfs>"
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        "</styleSheet>"
    )
    root_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        "</Types>"
    )

    buffer = BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as workbook_archive:
        workbook_archive.writestr("[Content_Types].xml", content_types_xml)
        workbook_archive.writestr("_rels/.rels", root_rels_xml)
        workbook_archive.writestr("xl/workbook.xml", workbook_xml)
        workbook_archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        workbook_archive.writestr("xl/styles.xml", styles_xml)
        workbook_archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return buffer.getvalue()


class PharmacyDashboardViewSet(mixins.ListModelMixin, PharmacyBaseViewSet):
    serializer_class = PharmacyDashboardSerializer

    def list(self, request, *args, **kwargs):
        period = request.query_params.get("period", "monthly")
        if period not in {"daily", "weekly", "monthly", "annual", "custom"}:
            period = "monthly"
        try:
            recent_page = max(1, int(request.query_params.get("recent_page", "1")))
        except ValueError:
            recent_page = 1
        start_at, end_at, period_label = resolve_dashboard_period(
            period,
            request.query_params.get("from", "").strip(),
            request.query_params.get("to", "").strip(),
        )

        medicines = Medicine.objects.filter(pharmacist=request.user)
        setting, _ = PharmacySetting.objects.get_or_create(pharmacist=request.user)
        sales = (
            Sale.objects.filter(pharmacist=request.user)
            .select_related("patient", "payment", "prescription_document")
            .prefetch_related(Prefetch("items", queryset=SaleItem.objects.select_related("medicine").order_by("id")))
        )
        page_size = 10
        recent_sales_count = sales.count()
        low_stock_queryset = medicines.filter(quantity__lte=10).order_by("quantity", "name")
        low_stock_count = low_stock_queryset.count()
        low_stock_items = list(low_stock_queryset[:6])
        recent_sales = list(sales.order_by("-created_at")[(recent_page - 1) * page_size:recent_page * page_size])
        inventory_summary = summarize_inventory(medicines)

        period_sales = sales.filter(created_at__gte=start_at)
        if end_at is not None:
            period_sales = period_sales.filter(created_at__lt=end_at)
        internal_patients = period_sales.filter(customer_type=Sale.CustomerType.INTERNAL).aggregate(total=Count("patient", distinct=True))["total"] or 0
        external_patients = period_sales.filter(customer_type=Sale.CustomerType.EXTERNAL).aggregate(total=Count("patient", distinct=True))["total"] or 0
        sales_summary = summarize_sales(period_sales, setting.default_profit_percentage)
        family_planning_items_dispensed = 0
        family_planning_orders = ClinicalDocument.objects.filter(
            document_type=ClinicalDocument.DocumentType.FAMILY_PLANNING,
            payload__family_planning_record=True,
            payload__pharmacy_dispensed_by_id=request.user.id,
        )
        for order in family_planning_orders.iterator():
            payload = order.payload or {}
            dispensed_at_raw = payload.get("pharmacy_dispensed_at")
            dispensed_at = parse_datetime(dispensed_at_raw) if isinstance(dispensed_at_raw, str) else None
            if dispensed_at is None:
                continue
            if timezone.is_naive(dispensed_at):
                dispensed_at = timezone.make_aware(dispensed_at, timezone.get_current_timezone())
            dispensed_at = timezone.localtime(dispensed_at)
            if dispensed_at < start_at:
                continue
            if end_at is not None and dispensed_at >= end_at:
                continue
            items = payload.get("items")
            for item in items if isinstance(items, list) else []:
                try:
                    family_planning_items_dispensed += max(0, int(item.get("quantity") or 0))
                except (TypeError, ValueError, AttributeError):
                    continue
        patient_trend = build_patient_trend(period, period_sales)
        full_paid = period_sales.filter(payment__payment_type=Payment.PaymentType.FULL).count()
        discounted = period_sales.filter(payment__payment_type=Payment.PaymentType.DISCOUNT).count()
        free = period_sales.filter(payment__payment_type=Payment.PaymentType.FREE).count()
        pending_reception_payments = period_sales.filter(payment__status=Payment.Status.PENDING).count()
        approved_reception_payments = period_sales.filter(payment__status=Payment.Status.APPROVED).count()
        full_paid_amount = period_sales.filter(payment__payment_type=Payment.PaymentType.FULL).aggregate(total=Sum("payment__amount"))["total"] or Decimal("0.00")
        discounted_amount = period_sales.filter(payment__payment_type=Payment.PaymentType.DISCOUNT).aggregate(total=Sum("payment__amount"))["total"] or Decimal("0.00")
        free_amount = period_sales.filter(payment__payment_type=Payment.PaymentType.FREE).aggregate(total=Sum("payment__amount"))["total"] or Decimal("0.00")
        pending_reception_amount = period_sales.filter(payment__status=Payment.Status.PENDING).aggregate(total=Sum("payment__amount"))["total"] or Decimal("0.00")
        approved_reception_amount = period_sales.filter(payment__status=Payment.Status.APPROVED).aggregate(total=Sum("payment__amount"))["total"] or Decimal("0.00")

        serializer = self.get_serializer(
            {
                "period": period,
                "period_label": period_label,
                "medicines_count": medicines.count(),
                "medicines_registered_count": medicines.filter(
                    created_at__gte=start_at,
                    **({"created_at__lt": end_at} if end_at is not None else {}),
                ).count(),
                "low_stock_count": low_stock_count,
                "sales_count": period_sales.count(),
                "internal_patients": internal_patients,
                "internal_amount": sales_summary["internal_amount"],
                "external_patients": external_patients,
                "external_amount": sales_summary["external_amount"],
                "full_paid": full_paid,
                "full_paid_amount": full_paid_amount,
                "discounted": discounted,
                "discounted_amount": discounted_amount,
                "free": free,
                "free_amount": free_amount,
                "pending_reception_payments": pending_reception_payments,
                "pending_reception_amount": pending_reception_amount,
                "approved_reception_payments": approved_reception_payments,
                "approved_reception_amount": approved_reception_amount,
                "stock_units": inventory_summary["stock_units"],
                "inventory_value": inventory_summary["inventory_value_cost"],
                "total_billed": sales_summary["total_billed"],
                "sold_medicines_total": sales_summary["total_billed"],
                "sold_medicines_profit": sales_summary["sold_medicines_profit"],
                "sold_medicines_price": sales_summary["sold_medicines_price"],
                "family_planning_items_dispensed": family_planning_items_dispensed,
                "patient_trend": patient_trend,
                "recent_sales_count": recent_sales_count,
                "recent_sales": recent_sales,
                "low_stock_items": low_stock_items,
            }
        )
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="report")
    def report(self, request):
        from_date_raw = request.query_params.get("from", "").strip()
        to_date_raw = request.query_params.get("to", "").strip()
        from_date = parse_date(from_date_raw)
        to_date = parse_date(to_date_raw)
        errors: dict[str, str] = {}

        if from_date is None:
            errors["from"] = "Select a valid from date."
        if to_date is None:
            errors["to"] = "Select a valid to date."
        if errors:
            raise serializers.ValidationError(errors)
        if to_date < from_date:
            raise serializers.ValidationError({"to": "To date must be on or after from date."})

        medicines = Medicine.objects.filter(pharmacist=request.user)
        setting, _ = PharmacySetting.objects.get_or_create(pharmacist=request.user)
        sales = (
            Sale.objects.filter(
                pharmacist=request.user,
                created_at__date__gte=from_date,
                created_at__date__lte=to_date,
            )
            .select_related("patient", "payment", "prescription_document")
            .prefetch_related(Prefetch("items", queryset=SaleItem.objects.select_related("medicine").order_by("id")))
            .order_by("-created_at")
        )

        inventory_summary = summarize_inventory(medicines)
        sales_summary = summarize_sales(sales, setting.default_profit_percentage)

        return Response(
            {
                "from": from_date.isoformat(),
                "to": to_date.isoformat(),
                "sales_count": sales.count(),
                "sold_quantity": str(sales_summary["sold_quantity"]),
                "sold_amount": str(sales_summary["total_billed"]),
                "sold_cost_amount": str(sales_summary["sold_medicines_price"]),
                "sold_profit_amount": str(sales_summary["sold_medicines_profit"]),
                "available_medicines_count": inventory_summary["available_medicines_count"],
                "stock_units": str(inventory_summary["stock_units"]),
                "stock_value_cost": str(inventory_summary["inventory_value_cost"]),
                "stock_value_sale": str(inventory_summary["inventory_value_sale"]),
                "generated_at": timezone.localtime(timezone.now()).isoformat(),
            }
        )


class PharmacySettingViewSet(PharmacyBaseViewSet):
    serializer_class = PharmacySettingSerializer

    def list(self, request, *args, **kwargs):
        setting, _ = PharmacySetting.objects.get_or_create(pharmacist=request.user)
        return Response(self.get_serializer(setting).data)

    def update(self, request, *args, **kwargs):
        setting, _ = PharmacySetting.objects.get_or_create(pharmacist=request.user)
        serializer = self.get_serializer(setting, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        sync_medicine_profit_percentages(request.user)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        setting, _ = PharmacySetting.objects.get_or_create(pharmacist=request.user)
        serializer = self.get_serializer(setting, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        sync_medicine_profit_percentages(request.user)
        return Response(serializer.data)


class PharmacyMedicineViewSet(PharmacyBaseViewSet, viewsets.ModelViewSet):
    serializer_class = PharmacyMedicineSerializer

    def get_queryset(self):
        queryset = Medicine.objects.filter(pharmacist=self.request.user).order_by("name")
        search = self.request.query_params.get("q", "").strip()
        available_only = self.request.query_params.get("available")
        low_stock_only = self.request.query_params.get("low_stock")
        rutf_only = self.request.query_params.get("rutf_only")
        family_planning_only = self.request.query_params.get("family_planning_only")
        expired_only = self.request.query_params.get("expired_only")
        upcoming_expired_only = self.request.query_params.get("upcoming_expired_only")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(generic_name__icontains=search)
                | Q(country_of_product__icontains=search)
            )
        if available_only in {"1", "true", "yes"}:
            queryset = queryset.filter(quantity__gt=0)
        if low_stock_only in {"1", "true", "yes"}:
            queryset = queryset.filter(quantity__lt=10)
        if rutf_only in {"1", "true", "yes"}:
            queryset = queryset.filter(Q(name__icontains="rutf") | Q(generic_name__icontains="rutf")).order_by("expiry_date", "name")
        if family_planning_only in {"1", "true", "yes"}:
            queryset = queryset.filter(generic_name__iexact="Family Planning").order_by("expiry_date", "name")
        if expired_only in {"1", "true", "yes"}:
            current_month_start = timezone.localdate().replace(day=1)
            queryset = queryset.filter(expiry_date__isnull=False, expiry_date__lt=current_month_start).order_by("expiry_date", "name")
        if upcoming_expired_only in {"1", "true", "yes"}:
            current_month_start = timezone.localdate().replace(day=1)
            six_month_window_end = month_start_after(current_month_start, 6)
            queryset = queryset.filter(
                expiry_date__isnull=False,
                expiry_date__gte=current_month_start,
                expiry_date__lt=six_month_window_end,
            ).order_by("expiry_date", "name")
        return queryset

    def perform_create(self, serializer):
        serializer.save(pharmacist=self.request.user)

    def perform_destroy(self, instance):
        soft_delete_instance(instance, self.request.user)

    @action(detail=False, methods=["get"], url_path="export-xlsx")
    def export_xlsx(self, request):
        medicines = (
            Medicine.objects
            .filter(pharmacist=request.user, quantity__gt=0)
            .order_by("name")
        )
        rows: list[list[object]] = [[
            "Medicine",
            "Generic name",
            "Dosage form",
            "Strength",
            "Quantity",
            "Buy price",
            "Sell price",
            "Profit percentage",
            "Total price without profit",
            "Total price with profit",
        ]]
        total_without_profit = Decimal("0.00")
        total_with_profit = Decimal("0.00")

        for medicine in medicines:
            medicine_total_without_profit = money(medicine.buy_price * medicine.quantity)
            medicine_total_with_profit = money(medicine.sell_price * medicine.quantity)
            total_without_profit += medicine_total_without_profit
            total_with_profit += medicine_total_with_profit
            rows.append([
                medicine.name,
                medicine.generic_name,
                medicine.dosage_form,
                medicine.strength,
                medicine.quantity,
                medicine.buy_price,
                medicine.sell_price,
                medicine.profit_percentage,
                medicine_total_without_profit,
                medicine_total_with_profit,
            ])

        rows.append([
            "Grand total",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            money(total_without_profit),
            money(total_with_profit),
        ])

        workbook = build_xlsx_workbook("Medicine Stock", rows)
        today = timezone.localdate().isoformat()
        response = HttpResponse(
            workbook,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="medicine-stock-{today}.xlsx"'
        return response

    @action(detail=False, methods=["get"])
    def search(self, request):
        queryset = self.get_queryset()
        try:
            offset = max(0, int(request.query_params.get("offset", "0")))
        except ValueError:
            offset = 0
        limit = 5
        total = queryset.count()
        results = queryset[offset:offset + limit]
        next_offset = offset + limit if offset + limit < total else None
        return Response(
            {
                "results": self.get_serializer(results, many=True).data,
                "next_offset": next_offset,
            }
        )


class PharmacyPatientViewSet(PharmacyBaseViewSet, mixins.ListModelMixin):
    serializer_class = PharmacyPatientSearchSerializer

    def get_queryset(self):
        queryset = (
            Patient.objects.filter(documents__document_type=ClinicalDocument.DocumentType.PRESCRIPTION)
            .distinct()
            .order_by("-created_at")
        )
        search = self.request.query_params.get("q", "").strip()
        if search:
            queryset = queryset.filter(
                Q(registration_number__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )
        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        try:
            offset = max(0, int(request.query_params.get("offset", "0")))
        except ValueError:
            offset = 0
        limit = 5
        total = queryset.count()
        results = queryset[offset:offset + limit]
        next_offset = offset + limit if offset + limit < total else None
        return Response(
            {
                "results": self.get_serializer(results, many=True).data,
                "next_offset": next_offset,
            }
        )

    @action(detail=True, methods=["get"], url_path="latest-prescription")
    def latest_prescription(self, request, pk=None):
        prescription = latest_prescription_for_patient(pk)
        if not prescription:
            return Response(
                {"detail": "No saved prescription was found for this patient. The doctor must create and save a prescription first."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = PharmacyPrescriptionSerializer(
            {
                "id": prescription.id,
                "title": prescription.title,
                "created_at": prescription.created_at,
                "patient": prescription.patient_id,
                "patient_name": f"{prescription.patient.first_name} {prescription.patient.last_name}".strip(),
                "items": serialize_prescription_items(request.user, prescription),
            }
        )
        return Response(serializer.data)


class PharmacySaleViewSet(
    PharmacyBaseViewSet,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
):
    serializer_class = PharmacySaleSerializer

    def get_queryset(self):
        queryset = (
            Sale.objects.filter(pharmacist=self.request.user)
            .select_related("patient", "payment", "prescription_document")
            .prefetch_related(
                Prefetch("items", queryset=SaleItem.objects.select_related("medicine").order_by("id"))
            )
            .order_by("-created_at")
        )
        search = self.request.query_params.get("q", "").strip()
        if search:
            queryset = queryset.filter(
                Q(bill_no__icontains=search)
                | Q(customer_name__icontains=search)
                | Q(patient__first_name__icontains=search)
                | Q(patient__last_name__icontains=search)
                | Q(patient__registration_number__icontains=search)
            )
        return queryset

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return PharmacySaleCreateSerializer
        return PharmacySaleSerializer

    def _resolve_sale_customer(self, serializer, request, existing_sale: Sale | None = None):
        customer_type = serializer.validated_data["customer_type"]
        existing_customer_type = existing_sale.customer_type if existing_sale is not None else customer_type

        if existing_sale is not None and customer_type != existing_customer_type:
            raise serializers.ValidationError({"customer_type": "Customer type cannot be changed after the pharmacy bill is created."})

        if customer_type == Sale.CustomerType.INTERNAL:
            patient = Patient.objects.filter(pk=serializer.validated_data["patient"]).first()
            if patient is None:
                raise serializers.ValidationError({"patient": "Selected patient was not found."})
            prescription_id = serializer.validated_data.get("prescription_document")
            if prescription_id:
                prescription = ClinicalDocument.objects.filter(
                    pk=prescription_id,
                    patient=patient,
                    document_type=ClinicalDocument.DocumentType.PRESCRIPTION,
                ).first()
            else:
                prescription = latest_prescription_for_patient(patient.id)
            if prescription is None:
                raise serializers.ValidationError({"patient": "This patient has no prescription yet."})
            return customer_type, patient, prescription, f"{patient.first_name} {patient.last_name}".strip()

        customer_name = serializer.validated_data.get("customer_name", "").strip()
        if existing_sale is None or existing_sale.patient is None:
            patient = Patient.objects.create(
                registration_number=next_patient_registration_number(),
                first_name=customer_name,
                last_name="",
                age=None,
                gender=Patient.Gender.OTHER,
                date_of_birth=None,
                phone="",
                address="",
                guardian_name="",
                registered_by=request.user,
            )
        else:
            patient = existing_sale.patient
            patient.first_name = customer_name
            patient.last_name = ""
            patient.save(update_fields=["first_name", "last_name", "updated_at"])
        return customer_type, patient, None, customer_name

    def _prepare_sale_items(self, user, requested_items, existing_sale: Sale | None = None):
        existing_items = list(existing_sale.items.all()) if existing_sale is not None else []
        medicine_ids = {
            item["medicine"]
            for item in requested_items
        }
        medicine_ids.update(item.medicine_id for item in existing_items if item.medicine_id is not None)

        medicines = {
            medicine.id: medicine
            for medicine in Medicine.objects.select_for_update().filter(
                pk__in=medicine_ids,
                pharmacist=user,
            )
        }
        available_quantities = {
            medicine_id: medicine.quantity
            for medicine_id, medicine in medicines.items()
        }

        for item in existing_items:
            if item.medicine_id in available_quantities:
                available_quantities[item.medicine_id] += item.quantity

        prepared_items = []
        for item in requested_items:
            medicine = medicines.get(item["medicine"])
            if medicine is None:
                raise serializers.ValidationError(
                    {"items": [f"Medicine {item['medicine']} is invalid."]}
                )
            if item["quantity"] > available_quantities[medicine.id]:
                raise serializers.ValidationError(
                    {"items": [f"{medicine.name}: only {available_quantities[medicine.id]} available in stock."]}
                )
            available_quantities[medicine.id] -= item["quantity"]
            prepared_items.append((medicine, item["quantity"]))

        return existing_items, medicines, prepared_items

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            customer_type, patient, prescription, customer_name = self._resolve_sale_customer(serializer, request)
            _existing_items, _medicines, prepared_items = self._prepare_sale_items(
                request.user,
                serializer.validated_data["items"],
            )

            sale = Sale.objects.create(
                pharmacist=request.user,
                customer_type=customer_type,
                patient=patient,
                prescription_document=prescription,
                customer_name=customer_name,
            )

            for medicine, quantity in prepared_items:
                SaleItem.objects.create(
                    sale=sale,
                    medicine=medicine,
                    medicine_name=medicine.name,
                    generic_name=medicine.generic_name,
                    quantity=quantity,
                    unit_price=medicine.sell_price,
                )
                medicine.quantity -= quantity
                medicine.save(update_fields=["quantity", "sell_price", "updated_at"])

            payment = Payment.objects.create(
                patient=patient,
                service="Pharmacy bill",
                department="Pharmacy",
                doctor_name="",
                patient_age=patient.age,
                patient_age_unit=patient.age_unit,
                doctor_fee=sale.total_amount,
                payment_type=Payment.PaymentType.FULL,
                discount_percentage=Decimal("0.00"),
                discount_amount=Decimal("0.00"),
                amount=sale.total_amount,
                status=Payment.Status.PENDING,
                notes=f"Pharmacy {customer_type} bill {sale.bill_no}",
                created_by=request.user,
            )
            sale.payment = payment
            sale.save(update_fields=["payment", "customer_name"])

        output = PharmacySaleSerializer(sale, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        sale = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            customer_type, patient, prescription, customer_name = self._resolve_sale_customer(
                serializer,
                request,
                existing_sale=sale,
            )
            existing_items, medicines, prepared_items = self._prepare_sale_items(
                request.user,
                serializer.validated_data["items"],
                existing_sale=sale,
            )

            payment = sale.payment
            if payment is None:
                raise serializers.ValidationError({"payment": "This pharmacy bill is missing the linked payment record."})

            for item in existing_items:
                if item.medicine_id in medicines:
                    medicine = medicines[item.medicine_id]
                    medicine.quantity += item.quantity

            sale.items.all().delete()

            for medicine, quantity in prepared_items:
                SaleItem.objects.create(
                    sale=sale,
                    medicine=medicine,
                    medicine_name=medicine.name,
                    generic_name=medicine.generic_name,
                    quantity=quantity,
                    unit_price=medicine.sell_price,
                )
                medicine.quantity -= quantity

            for medicine in medicines.values():
                medicine.save(update_fields=["quantity", "sell_price", "updated_at"])

            payment.patient = patient
            payment.patient_age = patient.age
            payment.patient_age_unit = patient.age_unit
            payment.doctor_fee = sale.total_amount
            payment.amount = sale.total_amount
            payment.notes = f"Pharmacy {customer_type} bill {sale.bill_no}"
            payment.save(update_fields=["patient", "patient_age", "patient_age_unit", "doctor_fee", "amount", "notes", "updated_at"])

            sale.patient = patient
            sale.prescription_document = prescription
            sale.customer_name = customer_name
            sale.save(update_fields=["patient", "prescription_document", "customer_name"])

        output = PharmacySaleSerializer(sale, context=self.get_serializer_context())
        return Response(output.data)

    def destroy(self, request, *args, **kwargs):
        sale = self.get_object()
        with transaction.atomic():
            soft_delete_instance(sale, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PharmacyRutfOrderViewSet(PharmacyBaseViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin):
    serializer_class = PharmacyRutfOrderSerializer

    def get_queryset(self):
        queryset = (
            ClinicalDocument.objects.filter(
                document_type=ClinicalDocument.DocumentType.RUTF,
                payload__malnutrition_record=True,
            )
            .select_related("patient", "created_by")
            .order_by("-created_at")
        )
        search = self.request.query_params.get("q", "").strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(patient__first_name__icontains=search)
                | Q(patient__last_name__icontains=search)
                | Q(patient__registration_number__icontains=search)
            )
        status_filter = self.request.query_params.get("status", "").strip().lower()
        if status_filter == "pending":
            queryset = queryset.exclude(payload__pharmacy_status="approved")
        elif status_filter == "approved":
            queryset = queryset.filter(payload__pharmacy_status="approved")
        return queryset

    def serialize_order(self, document):
        payload = document.payload or {}
        return {
            "id": document.id,
            "patient": document.patient_id,
            "patient_name": f"{document.patient.first_name} {document.patient.last_name}".strip(),
            "created_by_name": document.created_by.get_full_name() or document.created_by.username,
            "title": document.title,
            "created_at": document.created_at,
            "payload": payload,
            "rutf_quantity": int(payload.get("rutf_quantity") or 0),
            "pharmacy_status": str(payload.get("pharmacy_status") or "pending"),
            "approved_by_name": str(payload.get("pharmacy_approved_by_name") or ""),
        }

    def list(self, request, *args, **kwargs):
        queryset = self.paginate_queryset(self.get_queryset())
        serialized = [self.serialize_order(document) for document in queryset]
        page = self.get_paginated_response(self.get_serializer(serialized, many=True).data)
        return page

    def retrieve(self, request, *args, **kwargs):
        document = self.get_object()
        serializer = self.get_serializer(self.serialize_order(document))
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        document = self.get_object()
        with transaction.atomic():
            locked_document = ClinicalDocument.objects.select_for_update().select_related("patient").get(pk=document.pk)
            payload = dict(locked_document.payload or {})
            if payload.get("pharmacy_status") == "approved":
                serializer = self.get_serializer(self.serialize_order(locked_document))
                return Response(serializer.data)

            quantity = int(payload.get("rutf_quantity") or 0)
            if quantity <= 0:
                raise serializers.ValidationError({"payload": "Requested malnutrition quantity must be greater than zero."})

            medicine = match_rutf_medicine(request.user)
            if medicine is None:
                raise serializers.ValidationError({"medicine": "No malnutrition stock was found. Add it from the malnutrition stock page first."})
            if quantity > medicine.quantity:
                raise serializers.ValidationError({"medicine": f"Only {medicine.quantity} available in malnutrition stock."})

            medicine.quantity -= quantity
            medicine.save(update_fields=["quantity", "sell_price", "updated_at"])

            payload["pharmacy_status"] = "approved"
            payload["pharmacy_approved_at"] = timezone.now().isoformat()
            payload["pharmacy_approved_by_name"] = request.user.get_full_name() or request.user.username
            payload["pharmacy_medicine_id"] = medicine.id
            payload["pharmacy_medicine_name"] = medicine.name
            locked_document.payload = payload
            locked_document.save(update_fields=["payload", "updated_at"])

        serializer = self.get_serializer(self.serialize_order(locked_document))
        return Response(serializer.data)


class PharmacyFamilyPlanningOrderViewSet(
    PharmacyBaseViewSet,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
):
    serializer_class = PharmacyFamilyPlanningOrderSerializer
    pagination_class = PharmacyFamilyPlanningOrderPagination

    def get_queryset(self):
        queryset = (
            ClinicalDocument.objects.filter(
                document_type=ClinicalDocument.DocumentType.FAMILY_PLANNING,
                payload__family_planning_record=True,
            )
            .select_related("patient", "created_by")
            .order_by("-created_at")
        )
        search = self.request.query_params.get("q", "").strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(patient__first_name__icontains=search)
                | Q(patient__last_name__icontains=search)
                | Q(patient__registration_number__icontains=search)
            )
        status_filter = self.request.query_params.get("status", "").strip().lower()
        if status_filter == "pending":
            queryset = queryset.exclude(payload__pharmacy_status="dispensed")
        elif status_filter == "dispensed":
            queryset = queryset.filter(payload__pharmacy_status="dispensed")
        return queryset

    def serialize_order(self, document):
        payload = document.payload or {}
        items = payload.get("items") if isinstance(payload, dict) else []
        serialized_items = []
        for item in items if isinstance(items, list) else []:
            try:
                quantity = int(item.get("quantity") or 0)
            except (TypeError, ValueError):
                quantity = 0
            serialized_items.append(
                {
                    "medicine": int(item.get("medicine") or 0),
                    "medicine_name": str(item.get("medicine_name") or ""),
                    "quantity": quantity,
                }
            )
        return {
            "id": document.id,
            "patient": document.patient_id,
            "patient_name": f"{document.patient.first_name} {document.patient.last_name}".strip(),
            "created_by_name": document.created_by.get_full_name() or document.created_by.username,
            "title": document.title,
            "created_at": document.created_at,
            "payload": payload,
            "items": serialized_items,
            "item_count": len(serialized_items),
            "pharmacy_status": str(payload.get("pharmacy_status") or "pending"),
            "dispensed_by_name": str(payload.get("pharmacy_dispensed_by_name") or ""),
        }

    def list(self, request, *args, **kwargs):
        queryset = self.paginate_queryset(self.get_queryset())
        serialized = [self.serialize_order(document) for document in queryset]
        page = self.get_paginated_response(self.get_serializer(serialized, many=True).data)
        return page

    def retrieve(self, request, *args, **kwargs):
        document = self.get_object()
        serializer = self.get_serializer(self.serialize_order(document))
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        payload = request.data.get("payload") if isinstance(request.data, dict) else None
        document_data = {
            "patient": request.data.get("patient"),
            "document_type": ClinicalDocument.DocumentType.FAMILY_PLANNING,
            "title": request.data.get("title") or "Family planning order",
            "total_amount": "0",
            "payload": payload,
        }
        serializer = ClinicalDocumentSerializer(data=document_data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        document = serializer.save(created_by=request.user)
        return Response(self.get_serializer(self.serialize_order(document)).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        document = self.get_object()
        with transaction.atomic():
            locked_document = ClinicalDocument.objects.select_for_update().select_related("patient", "created_by").get(pk=document.pk)
            existing_payload = dict(locked_document.payload or {})
            was_dispensed = existing_payload.get("pharmacy_status") == "dispensed"
            if was_dispensed:
                restore_family_planning_stock(request.user, existing_payload)

            pharmacy_payload = {
                key: value
                for key, value in existing_payload.items()
                if str(key).startswith("pharmacy_")
            }
            new_payload = request.data.get("payload") if isinstance(request.data, dict) else None
            if isinstance(new_payload, dict):
                merged_payload = {**new_payload, **pharmacy_payload}
            else:
                merged_payload = {**existing_payload}

            serializer = ClinicalDocumentSerializer(
                locked_document,
                data={
                    "patient": request.data.get("patient", locked_document.patient_id),
                    "document_type": ClinicalDocument.DocumentType.FAMILY_PLANNING,
                    "title": request.data.get("title") or locked_document.title,
                    "total_amount": "0",
                    "payload": merged_payload,
                },
                partial=True,
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            updated_document = serializer.save()

            if was_dispensed:
                deduct_family_planning_stock(request.user, updated_document.payload)

        return Response(self.get_serializer(self.serialize_order(updated_document)).data)

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        with transaction.atomic():
            locked_document = ClinicalDocument.objects.select_for_update().get(pk=document.pk)
            soft_delete_instance(locked_document, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def dispense(self, request, pk=None):
        document = self.get_object()
        with transaction.atomic():
            locked_document = ClinicalDocument.objects.select_for_update().select_related("patient").get(pk=document.pk)
            payload = dict(locked_document.payload or {})
            if payload.get("pharmacy_status") == "dispensed":
                serializer = self.get_serializer(self.serialize_order(locked_document))
                return Response(serializer.data)
            deduct_family_planning_stock(request.user, payload)

            payload["pharmacy_status"] = "dispensed"
            payload["pharmacy_dispensed_at"] = timezone.now().isoformat()
            payload["pharmacy_dispensed_by_name"] = request.user.get_full_name() or request.user.username
            payload["pharmacy_dispensed_by_id"] = request.user.id
            locked_document.payload = payload
            locked_document.save(update_fields=["payload", "updated_at"])

        serializer = self.get_serializer(self.serialize_order(locked_document))
        return Response(serializer.data)
