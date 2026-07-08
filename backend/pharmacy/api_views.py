from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Prefetch, Q, Sum
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.access import user_has_permission
from accounts.permissions import Role
from clinic.models import ClinicalDocument, Patient, Payment

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
        super().check_permissions(request)
        if not is_pharmacy_user(request.user):
            self.permission_denied(request, message="Only pharmacist accounts can access pharmacy APIs.")


def next_patient_registration_number() -> str:
    numeric_registration_numbers = [
        int(registration_number)
        for registration_number in Patient.objects.select_for_update().values_list("registration_number", flat=True)
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


class PharmacyDashboardViewSet(mixins.ListModelMixin, PharmacyBaseViewSet):
    serializer_class = PharmacyDashboardSerializer

    def list(self, request, *args, **kwargs):
        period = request.query_params.get("period", "monthly")
        if period not in {"daily", "weekly", "monthly", "annual"}:
            period = "monthly"
        try:
            recent_page = max(1, int(request.query_params.get("recent_page", "1")))
        except ValueError:
            recent_page = 1
        start_at, period_label = dashboard_period_start(period)

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
        inventory_value = Decimal("0.00")
        for medicine in medicines:
            inventory_value += medicine.buy_price * medicine.quantity

        period_sales = sales.filter(created_at__gte=start_at)
        internal_patients = period_sales.filter(customer_type=Sale.CustomerType.INTERNAL).aggregate(total=Count("patient", distinct=True))["total"] or 0
        external_patients = period_sales.filter(customer_type=Sale.CustomerType.EXTERNAL).aggregate(total=Count("patient", distinct=True))["total"] or 0
        internal_amount = Decimal("0.00")
        external_amount = Decimal("0.00")
        total_billed = Decimal("0.00")
        sold_medicines_price = Decimal("0.00")
        for sale in period_sales:
            sale_total = sale.total_amount
            total_billed += sale_total
            if sale.customer_type == Sale.CustomerType.INTERNAL:
                internal_amount += sale_total
            else:
                external_amount += sale_total
            for item in sale.items.all():
                sold_medicines_price += money(sale_item_cost_price(item, setting.default_profit_percentage) * item.quantity)
        sold_medicines_price = money(sold_medicines_price)
        sold_medicines_profit = money(total_billed - sold_medicines_price)
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
                "medicines_registered_count": medicines.filter(created_at__gte=start_at).count(),
                "low_stock_count": low_stock_count,
                "sales_count": period_sales.count(),
                "internal_patients": internal_patients,
                "internal_amount": internal_amount,
                "external_patients": external_patients,
                "external_amount": external_amount,
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
                "stock_units": medicines.aggregate(total=Sum("quantity"))["total"] or 0,
                "inventory_value": inventory_value,
                "total_billed": total_billed,
                "sold_medicines_total": total_billed,
                "sold_medicines_profit": sold_medicines_profit,
                "sold_medicines_price": sold_medicines_price,
                "family_planning_items_dispensed": family_planning_items_dispensed,
                "patient_trend": patient_trend,
                "recent_sales_count": recent_sales_count,
                "recent_sales": recent_sales,
                "low_stock_items": low_stock_items,
            }
        )
        return Response(serializer.data)


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

    def _guard_sale_editable(self, sale: Sale):
        if sale.payment is not None and sale.payment.status != Payment.Status.PENDING:
            raise serializers.ValidationError({"payment": "Only pharmacy bills with pending reception payment can be edited."})

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
        self._guard_sale_editable(sale)
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
            payment.doctor_fee = sale.total_amount
            payment.amount = sale.total_amount
            payment.notes = f"Pharmacy {customer_type} bill {sale.bill_no}"
            payment.save(update_fields=["patient", "patient_age", "doctor_fee", "amount", "notes", "updated_at"])

            sale.patient = patient
            sale.prescription_document = prescription
            sale.customer_name = customer_name
            sale.save(update_fields=["patient", "prescription_document", "customer_name"])

        output = PharmacySaleSerializer(sale, context=self.get_serializer_context())
        return Response(output.data)

    def destroy(self, request, *args, **kwargs):
        sale = self.get_object()
        with transaction.atomic():
            for item in sale.items.select_related("medicine").all():
                medicine = Medicine.objects.select_for_update().filter(pk=item.medicine_id, pharmacist=request.user).first()
                if medicine is not None:
                    medicine.quantity += item.quantity
                    medicine.save(update_fields=["quantity", "sell_price", "updated_at"])
            payment = sale.payment
            sale.delete()
            if payment is not None:
                payment.delete()
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


class PharmacyFamilyPlanningOrderViewSet(PharmacyBaseViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin):
    serializer_class = PharmacyFamilyPlanningOrderSerializer

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

    @action(detail=True, methods=["post"])
    def dispense(self, request, pk=None):
        document = self.get_object()
        with transaction.atomic():
            locked_document = ClinicalDocument.objects.select_for_update().select_related("patient").get(pk=document.pk)
            payload = dict(locked_document.payload or {})
            if payload.get("pharmacy_status") == "dispensed":
                serializer = self.get_serializer(self.serialize_order(locked_document))
                return Response(serializer.data)

            items = payload.get("items")
            if not isinstance(items, list) or not items:
                raise serializers.ValidationError({"payload": "No family planning items were found in this order."})

            medicines_to_update = []
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

                medicine = match_family_planning_medicine(request.user, medicine_id)
                if medicine is None:
                    raise serializers.ValidationError({"medicine": f"Family planning stock item #{medicine_id} was not found."})
                medicine = Medicine.objects.select_for_update().get(pk=medicine.pk)
                if quantity > medicine.quantity:
                    raise serializers.ValidationError({"medicine": f"Only {medicine.quantity} available for {medicine.name}."})
                medicines_to_update.append((medicine, quantity))

            for medicine, quantity in medicines_to_update:
                medicine.quantity -= quantity
                medicine.save(update_fields=["quantity", "sell_price", "updated_at"])

            payload["pharmacy_status"] = "dispensed"
            payload["pharmacy_dispensed_at"] = timezone.now().isoformat()
            payload["pharmacy_dispensed_by_name"] = request.user.get_full_name() or request.user.username
            payload["pharmacy_dispensed_by_id"] = request.user.id
            locked_document.payload = payload
            locked_document.save(update_fields=["payload", "updated_at"])

        serializer = self.get_serializer(self.serialize_order(locked_document))
        return Response(serializer.data)
