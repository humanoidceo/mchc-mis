from decimal import Decimal

from django.db import transaction
from django.db.models import Prefetch, Q, Sum
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
        today_start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
        month_start = today_start.replace(day=1)

        medicines = Medicine.objects.filter(pharmacist=request.user)
        sales = (
            Sale.objects.filter(pharmacist=request.user)
            .select_related("patient", "payment", "prescription_document")
            .prefetch_related("items")
        )
        low_stock_queryset = medicines.filter(quantity__lte=10).order_by("quantity", "name")
        low_stock_count = low_stock_queryset.count()
        low_stock_items = list(low_stock_queryset[:6])
        recent_sales = list(sales.order_by("-created_at")[:6])
        inventory_value = Decimal("0.00")
        for medicine in medicines:
            inventory_value += medicine.buy_price * medicine.quantity

        today_revenue = Decimal("0.00")
        monthly_revenue = Decimal("0.00")
        for sale in sales.filter(created_at__gte=month_start):
            total = sale.total_amount
            monthly_revenue += total
            if sale.created_at >= today_start:
                today_revenue += total

        serializer = self.get_serializer(
            {
                "medicines_count": medicines.count(),
                "low_stock_count": low_stock_count,
                "sales_count": sales.count(),
                "stock_units": medicines.aggregate(total=Sum("quantity"))["total"] or 0,
                "inventory_value": inventory_value,
                "today_revenue": today_revenue,
                "monthly_revenue": monthly_revenue,
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
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(generic_name__icontains=search))
        if available_only in {"1", "true", "yes"}:
            queryset = queryset.filter(quantity__gt=0)
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
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
):
    serializer_class = PharmacySaleSerializer

    def get_queryset(self):
        return (
            Sale.objects.filter(pharmacist=self.request.user)
            .select_related("patient", "payment", "prescription_document")
            .prefetch_related(
                Prefetch("items", queryset=SaleItem.objects.select_related("medicine").order_by("id"))
            )
            .order_by("-created_at")
        )

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
