from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Prefetch, Q, Sum
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.access import user_has_permission
from accounts.permissions import Role
from clinic.models import ClinicalDocument, Patient, Payment

from .models import Medicine, PharmacySetting, Sale, SaleItem
from .serializers import (
    PharmacyDashboardSerializer,
    PharmacyMedicineSerializer,
    PharmacyPatientSearchSerializer,
    PharmacyPrescriptionSerializer,
    PharmacySaleCreateSerializer,
    PharmacySaleSerializer,
    PharmacySettingSerializer,
)


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
        sales = (
            Sale.objects.filter(pharmacist=request.user)
            .select_related("patient", "payment", "prescription_document")
            .prefetch_related("items")
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
        for sale in period_sales:
            sale_total = sale.total_amount
            total_billed += sale_total
            if sale.customer_type == Sale.CustomerType.INTERNAL:
                internal_amount += sale_total
            else:
                external_amount += sale_total
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
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        setting, _ = PharmacySetting.objects.get_or_create(pharmacist=request.user)
        serializer = self.get_serializer(setting, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PharmacyMedicineViewSet(PharmacyBaseViewSet, viewsets.ModelViewSet):
    serializer_class = PharmacyMedicineSerializer

    def get_queryset(self):
        queryset = Medicine.objects.filter(pharmacist=self.request.user).order_by("name")
        search = self.request.query_params.get("q", "").strip()
        available_only = self.request.query_params.get("available")
        low_stock_only = self.request.query_params.get("low_stock")
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(generic_name__icontains=search))
        if available_only in {"1", "true", "yes"}:
            queryset = queryset.filter(quantity__gt=0)
        if low_stock_only in {"1", "true", "yes"}:
            queryset = queryset.filter(quantity__lt=10)
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
        if self.action == "create":
            return PharmacySaleCreateSerializer
        return PharmacySaleSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            prepared_items = []
            customer_type = serializer.validated_data["customer_type"]
            patient = None
            prescription = None

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
            else:
                customer_name = serializer.validated_data.get("customer_name", "").strip()
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

            for item in serializer.validated_data["items"]:
                medicine = Medicine.objects.select_for_update().filter(
                    pk=item["medicine"],
                    pharmacist=request.user,
                ).first()
                if medicine is None:
                    raise serializers.ValidationError(
                        {"items": [f"Medicine {item['medicine']} is invalid."]}
                    )
                if item["quantity"] > medicine.quantity:
                    raise serializers.ValidationError(
                        {"items": [f"{medicine.name}: only {medicine.quantity} available in stock."]}
                    )
                prepared_items.append((medicine, item["quantity"]))

            sale = Sale.objects.create(
                pharmacist=request.user,
                customer_type=customer_type,
                patient=patient,
                prescription_document=prescription,
                customer_name=serializer.validated_data.get("customer_name", "").strip(),
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
            if customer_type == Sale.CustomerType.INTERNAL and not sale.customer_name:
                sale.customer_name = f"{patient.first_name} {patient.last_name}".strip()
            sale.save(update_fields=["payment", "customer_name"])

        output = PharmacySaleSerializer(sale, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_201_CREATED)

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
