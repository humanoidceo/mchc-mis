from datetime import timedelta

from django.utils import timezone
from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncDate, TruncMonth
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.access import get_user_permissions, user_has_permission
from pharmacy.models import Medicine as PharmacyMedicine
from .models import ClinicalDocument, LabTest, Medicine, MedicineStockMovement, Patient, Payment, WebsitePageContent, WebsiteSettings
from .serializers import (
    ClinicalDocumentSerializer,
    LabTestSerializer,
    MedicineSerializer,
    MedicineStockMovementSerializer,
    PatientSerializer,
    PaymentSerializer,
    WebsitePageContentSerializer,
    WebsiteSettingsSerializer,
)


DOCUMENT_CREATE_PERMISSIONS = {
    ClinicalDocument.DocumentType.PRESCRIPTION: 'documents.prescription.create',
    ClinicalDocument.DocumentType.LAB_ORDER: 'documents.lab_order.create',
    ClinicalDocument.DocumentType.LAB_BILL: 'documents.lab_bill.create',
    ClinicalDocument.DocumentType.MEDICINE_BILL: 'documents.medicine_bill.create',
    ClinicalDocument.DocumentType.ULTRASOUND: 'documents.ultrasound.create',
    ClinicalDocument.DocumentType.VACCINATION: 'documents.vaccination.create',
    ClinicalDocument.DocumentType.RUTF: 'documents.rutf.create',
}


def dashboard_period_start(period: str):
    now = timezone.localtime(timezone.now())
    if period == 'annual':
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0), 'Annual'
    if period == 'monthly':
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), 'Monthly'
    if period == 'weekly':
        start = now - timedelta(days=now.weekday())
        return start.replace(hour=0, minute=0, second=0, microsecond=0), 'Weekly'
    return now.replace(hour=0, minute=0, second=0, microsecond=0), 'Daily'


def build_patient_trend(period: str, patients_queryset, *, distinct_patient_field: str | None = None):
    now = timezone.localtime(timezone.now())

    if period == 'annual':
        month_rows = (
            patients_queryset
            .annotate(bucket=TruncMonth('created_at'))
            .values('bucket')
            .annotate(
                value=Count(distinct_patient_field, distinct=True) if distinct_patient_field else Count('id')
            )
            .order_by('bucket')
        )
        counts = {
            row['bucket'].month: row['value']
            for row in month_rows
            if row['bucket'] is not None
        }
        return [
            {
                'label': month_label,
                'value': counts.get(index, 0),
            }
            for index, month_label in enumerate(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], start=1)
        ]

    if period == 'weekly':
        start = now - timedelta(days=now.weekday())
        bucket_count = 7
    elif period == 'monthly':
        start = now.replace(day=1)
        bucket_count = now.day
    else:
        return []

    start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    day_rows = (
        patients_queryset
        .annotate(bucket=TruncDate('created_at'))
        .values('bucket')
        .annotate(
            value=Count(distinct_patient_field, distinct=True) if distinct_patient_field else Count('id')
        )
        .order_by('bucket')
    )
    counts = {
        row['bucket']: row['value']
        for row in day_rows
        if row['bucket'] is not None
    }
    labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] if period == 'weekly' else None
    return [
        {
            'label': labels[index] if labels else str((start + timedelta(days=index)).day),
            'value': counts.get((start + timedelta(days=index)).date(), 0),
        }
        for index in range(bucket_count)
    ]


def next_patient_registration_number() -> str:
    numeric_registration_numbers = [
        int(registration_number)
        for registration_number in Patient.objects.select_for_update().values_list('registration_number', flat=True)
        if registration_number.isdigit()
    ]
    return str(max(numeric_registration_numbers, default=0) + 1)


def search_response(queryset, serializer_class, request, search_fields: tuple[str, ...], limit: int = 5):
    search = request.query_params.get('q', '').strip()
    try:
        offset = max(0, int(request.query_params.get('offset', '0')))
    except ValueError:
        offset = 0

    if search:
        from django.db.models import Q

        condition = Q()
        for field in search_fields:
            condition |= Q(**{f'{field}__icontains': search})
        queryset = queryset.filter(condition)

    total = queryset.count()
    results = queryset[offset:offset + limit]
    next_offset = offset + limit if offset + limit < total else None
    return Response(
        {
            'results': serializer_class(results, many=True, context={'request': request}).data,
            'next_offset': next_offset,
        }
    )


class PermissionedModelViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAuthenticated,)
    permission_map: dict[str, str] = {}

    def get_required_permission(self) -> str | None:
        return self.permission_map.get(self.action) or self.permission_map.get('*')

    def check_permissions(self, request):
        super().check_permissions(request)
        code = self.get_required_permission()
        if code and not user_has_permission(request.user, code):
            self.permission_denied(request, message=f'Missing permission: {code}')


class PatientViewSet(PermissionedModelViewSet):
    queryset = Patient.objects.select_related('registered_by')
    serializer_class = PatientSerializer
    permission_map = {
        'list': 'patients.view',
        'retrieve': 'patients.view',
        'create': 'patients.register',
        'update': 'patients.register',
        'partial_update': 'patients.register',
        'destroy': 'patients.register',
    }

    def perform_create(self, serializer):
        with transaction.atomic():
            serializer.save(
                registered_by=self.request.user,
                registration_number=next_patient_registration_number(),
            )

    @action(detail=False, methods=['get'])
    def search(self, request):
        return search_response(self.get_queryset(), self.get_serializer_class(), request, ('registration_number', 'first_name', 'last_name'))


class PaymentViewSet(PermissionedModelViewSet):
    queryset = Payment.objects.select_related('patient', 'created_by', 'approved_by')
    serializer_class = PaymentSerializer
    permission_map = {
        '*': 'payments.view',
        'create': 'payments.approve',
        'update': 'payments.approve',
        'partial_update': 'payments.approve',
        'destroy': 'payments.approve',
        'approve': 'payments.approve',
        'reception_bill': 'payments.approve',
    }

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='reception-bill')
    def reception_bill(self, request):
        patient_data = request.data.get('patient') or {}
        payment_data = request.data.get('payment') or {}

        with transaction.atomic():
            patient_serializer = PatientSerializer(data=patient_data, context=self.get_serializer_context())
            patient_serializer.is_valid(raise_exception=True)
            patient = patient_serializer.save(
                registered_by=request.user,
                registration_number=next_patient_registration_number(),
            )

            payment_serializer = self.get_serializer(
                data={
                    **payment_data,
                    'patient': patient.id,
                },
            )
            payment_serializer.is_valid(raise_exception=True)
            payment = payment_serializer.save(created_by=request.user)

        return Response(self.get_serializer(payment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        payment = self.get_object()
        payment.status = Payment.Status.APPROVED
        payment.approved_by = request.user
        payment.approved_at = timezone.now()
        payment.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])
        return Response(self.get_serializer(payment).data)


class ClinicalDocumentViewSet(PermissionedModelViewSet):
    queryset = ClinicalDocument.objects.select_related('patient', 'created_by')
    serializer_class = ClinicalDocumentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        document_type = self.request.query_params.get('document_type')
        mine_only = self.request.query_params.get('mine')
        midwife_record = self.request.query_params.get('midwife_record')
        search = self.request.query_params.get('q', '').strip()
        if document_type:
            queryset = queryset.filter(document_type=document_type)
        if mine_only in {'1', 'true', 'yes'}:
            queryset = queryset.filter(created_by=self.request.user)
        if midwife_record in {'1', 'true', 'yes'}:
            queryset = queryset.filter(
                document_type=ClinicalDocument.DocumentType.ULTRASOUND,
                payload__midwife_record=True,
            )
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(patient__first_name__icontains=search)
                | Q(patient__last_name__icontains=search)
                | Q(patient__registration_number__icontains=search)
            )
        return queryset

    def get_required_permission(self) -> str | None:
        if self.action in {'list', 'retrieve'}:
            return None
        document_type = self.request.data.get('document_type')
        if not document_type and self.action in {'update', 'partial_update', 'destroy'}:
            instance = self.get_object()
            document_type = instance.document_type
        return DOCUMENT_CREATE_PERMISSIONS.get(document_type)

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action in {'list', 'retrieve'}:
            user_permissions = get_user_permissions(request.user)
            if not user_permissions.intersection(DOCUMENT_CREATE_PERMISSIONS.values()):
                self.permission_denied(request, message='Missing document access permission.')

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def types(self, request):
        visible = [
            {'code': key, 'label': label, 'permission': DOCUMENT_CREATE_PERMISSIONS[key]}
            for key, label in ClinicalDocument.DocumentType.choices
            if user_has_permission(request.user, DOCUMENT_CREATE_PERMISSIONS[key])
        ]
        return Response(visible)


class MedicineViewSet(PermissionedModelViewSet):
    queryset = Medicine.objects.all()
    serializer_class = MedicineSerializer
    permission_map = {
        'create': 'stock.manage',
        'update': 'stock.manage',
        'partial_update': 'stock.manage',
        'destroy': 'stock.manage',
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action in {'list', 'retrieve', 'search'}:
            queryset = queryset.filter(is_active=True)
        return queryset

    @action(detail=False, methods=['get'])
    def search(self, request):
        queryset = self.get_queryset()
        if queryset.exists():
            return search_response(queryset, self.get_serializer_class(), request, ('name', 'unit'))

        search = request.query_params.get('q', '').strip()
        try:
            offset = max(0, int(request.query_params.get('offset', '0')))
        except ValueError:
            offset = 0

        pharmacy_queryset = PharmacyMedicine.objects.filter(quantity__gt=0).order_by('name')
        if search:
            pharmacy_queryset = pharmacy_queryset.filter(
                Q(name__icontains=search) | Q(generic_name__icontains=search)
            )

        total = pharmacy_queryset.count()
        results = pharmacy_queryset[offset:offset + 5]
        next_offset = offset + 5 if offset + 5 < total else None
        return Response(
            {
                'results': [
                    {
                        'id': medicine.id,
                        'name': medicine.name,
                        'unit': medicine.generic_name or 'medicine',
                        'sale_price': str(medicine.sell_price),
                        'current_stock': medicine.quantity,
                        'low_stock_threshold': 10,
                        'is_active': True,
                        'is_low_stock': medicine.quantity <= 10,
                    }
                    for medicine in results
                ],
                'next_offset': next_offset,
            }
        )


class LabTestViewSet(PermissionedModelViewSet):
    queryset = LabTest.objects.all()
    serializer_class = LabTestSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action in {'list', 'retrieve', 'search'}:
            queryset = queryset.filter(is_active=True)
        return queryset

    @action(detail=False, methods=['get'])
    def search(self, request):
        return search_response(self.get_queryset(), self.get_serializer_class(), request, ('name', 'unit'))


class MedicineStockMovementViewSet(PermissionedModelViewSet):
    queryset = MedicineStockMovement.objects.select_related('medicine', 'created_by')
    serializer_class = MedicineStockMovementSerializer
    permission_map = {'*': 'stock.manage'}

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class DashboardViewSet(viewsets.ViewSet):
    permission_classes = (IsAuthenticated,)

    def list(self, request):
        period = request.query_params.get('period', 'daily')
        if period not in {'daily', 'weekly', 'monthly', 'annual'}:
            period = 'daily'

        start_at, period_label = dashboard_period_start(period)
        profile = getattr(request.user, 'staff_profile', None)
        role = getattr(profile, 'role', None)

        if role == 'doctor':
            doctor_documents = ClinicalDocument.objects.filter(
                created_by=request.user,
                created_at__gte=start_at,
                document_type__in={
                    ClinicalDocument.DocumentType.PRESCRIPTION,
                    ClinicalDocument.DocumentType.LAB_ORDER,
                },
            )
            patient_ids = list(doctor_documents.values_list('patient_id', flat=True).distinct())
            doctor_payments = Payment.objects.filter(
                patient_id__in=patient_ids,
                created_at__gte=start_at,
            )
            patient_trend = build_patient_trend(
                period,
                doctor_documents,
                distinct_patient_field='patient',
            )
            pending_amount = doctor_payments.filter(status=Payment.Status.PENDING).aggregate(total=Sum('amount'))['total'] or 0
            approved_amount = doctor_payments.filter(status=Payment.Status.APPROVED).aggregate(total=Sum('amount'))['total'] or 0

            return Response(
                {
                    'period': period,
                    'period_label': period_label,
                    'patients': len(patient_ids),
                    'full_paid': doctor_payments.filter(payment_type=Payment.PaymentType.FULL).count(),
                    'free': doctor_payments.filter(payment_type=Payment.PaymentType.FREE).count(),
                    'discounted': doctor_payments.filter(payment_type=Payment.PaymentType.DISCOUNT).count(),
                    'pending_payments': doctor_payments.filter(status=Payment.Status.PENDING).count(),
                    'approved_payments': doctor_payments.filter(status=Payment.Status.APPROVED).count(),
                    'total_payments': doctor_payments.count(),
                    'pending_amount': str(pending_amount),
                    'approved_amount': str(approved_amount),
                    'total_amount': str(pending_amount + approved_amount),
                    'patient_trend': patient_trend,
                    'departments': [],
                    'documents': doctor_documents.count(),
                    'low_stock_medicines': 0,
                }
            )

        patients = Patient.objects.filter(created_at__gte=start_at)
        payments = Payment.objects.filter(created_at__gte=start_at)
        patient_trend = build_patient_trend(period, patients)

        pending_payments = payments.filter(status=Payment.Status.PENDING).count()
        approved_payments = payments.filter(status=Payment.Status.APPROVED).count()
        pending_amount = payments.filter(status=Payment.Status.PENDING).aggregate(total=Sum('amount'))['total'] or 0
        approved_amount = payments.filter(status=Payment.Status.APPROVED).aggregate(total=Sum('amount'))['total'] or 0

        departments = [
            {
                'department': row['department'] or 'Unassigned',
                'patients': row['patients'],
                'payments': row['payments'],
                'amount': str(row['amount'] or 0),
            }
            for row in payments.values('department').annotate(
                patients=Count('patient', distinct=True),
                payments=Count('id'),
                amount=Sum('amount'),
            ).order_by('department')
        ]

        return Response(
            {
                'period': period,
                'period_label': period_label,
                'patients': patients.count(),
                'full_paid': payments.filter(payment_type=Payment.PaymentType.FULL).count(),
                'free': payments.filter(payment_type=Payment.PaymentType.FREE).count(),
                'discounted': payments.filter(payment_type=Payment.PaymentType.DISCOUNT).count(),
                'pending_payments': pending_payments,
                'approved_payments': approved_payments,
                'total_payments': pending_payments + approved_payments,
                'pending_amount': str(pending_amount),
                'approved_amount': str(approved_amount),
                'total_amount': str(pending_amount + approved_amount),
                'patient_trend': patient_trend,
                'departments': departments,
                'documents': ClinicalDocument.objects.count(),
                'low_stock_medicines': Medicine.objects.filter(current_stock__lte=F('low_stock_threshold')).count(),
            }
        )


class WebsitePageContentViewSet(viewsets.ModelViewSet):
    queryset = WebsitePageContent.objects.select_related('updated_by')
    serializer_class = WebsitePageContentSerializer
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    pagination_class = None

    def get_permissions(self):
        if self.action in {'list', 'retrieve'}:
            return [AllowAny()]
        return [IsAuthenticated()]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method not in {'GET', 'HEAD', 'OPTIONS'} and not user_has_permission(request.user, 'website.content.manage'):
            self.permission_denied(request, message='Missing permission: website.content.manage')

    def get_queryset(self):
        queryset = super().get_queryset()
        page = self.request.query_params.get('page')
        language = self.request.query_params.get('language')
        if page:
            queryset = queryset.filter(page=page)
        if language:
            queryset = queryset.filter(language=language)
        return queryset

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class WebsiteSettingsViewSet(viewsets.ViewSet):
    parser_classes = (JSONParser, FormParser, MultiPartParser)

    def get_permissions(self):
        if self.action in {'list', 'retrieve'}:
            return [AllowAny()]
        return [IsAuthenticated()]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method not in {'GET', 'HEAD', 'OPTIONS'} and not user_has_permission(request.user, 'website.content.manage'):
            self.permission_denied(request, message='Missing permission: website.content.manage')

    def get_settings(self):
        settings, _created = WebsiteSettings.objects.select_related('updated_by').get_or_create(pk=1)
        return settings

    def list(self, request):
        return Response(WebsiteSettingsSerializer(self.get_settings()).data)

    @action(detail=False, methods=['patch', 'put'], url_path='current')
    def current(self, request):
        settings = self.get_settings()
        serializer = WebsiteSettingsSerializer(settings, data=request.data, partial=request.method == 'PATCH')
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response(serializer.data)
