from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.db import models
from django.db.models import Count
from django.db.models.functions import TruncDate, TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.access import user_has_permission
from accounts.trash import soft_delete_instance
from .models import ClinicalDocument, Patient, Payment, round_up_to_ten
from .serializers import ClinicalDocumentSerializer, MidwifeDashboardSerializer, PatientSerializer, PaymentSerializer


MIDWIFE_BILLING_PROCEDURES = {
    'iud_insertion': 'Insertion of IUD',
    'iud_removal': 'Removal of IUD',
    'implant_insertion': 'Insertion of implant',
    'implant_removal': 'Removal of implant',
}


def is_midwife_user(user) -> bool:
    return user_has_permission(user, 'documents.ultrasound.create')


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


def build_patient_trend(period: str, records_queryset):
    now = timezone.localtime(timezone.now())

    if period == 'annual':
        month_rows = (
            records_queryset
            .annotate(bucket=TruncMonth('created_at'))
            .values('bucket')
            .annotate(value=Count('patient', distinct=True))
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
        records_queryset
        .annotate(bucket=TruncDate('created_at'))
        .values('bucket')
        .annotate(value=Count('patient', distinct=True))
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


def parse_payload_date(payload: dict, key: str) -> date | None:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


class MidwifePatientViewSet(viewsets.ViewSet):
    permission_classes = (IsAuthenticated,)

    def list(self, request):
        if not is_midwife_user(request.user):
            self.permission_denied(request, message='Only midwife accounts can access midwife APIs.')

        search = request.query_params.get('q', '').strip()
        try:
            offset = max(0, int(request.query_params.get('offset', '0')))
        except ValueError:
            offset = 0

        queryset = Patient.objects.order_by('-created_at')
        if request.query_params.get('all') not in {'1', 'true', 'yes'}:
            queryset = queryset.filter(payments__department__iexact='Maternal care').distinct()
        if search:
            queryset = queryset.filter(
                models.Q(registration_number__icontains=search)
                | models.Q(first_name__icontains=search)
                | models.Q(last_name__icontains=search)
                | models.Q(phone__icontains=search)
            )

        total = queryset.count()
        results = queryset[offset:offset + 5]
        next_offset = offset + 5 if offset + 5 < total else None
        return Response(
            {
                'results': PatientSerializer(results, many=True, context={'request': request}).data,
                'next_offset': next_offset,
            }
        )


class MidwifeBillingViewSet(viewsets.ViewSet):
    permission_classes = (IsAuthenticated,)
    page_size = 10

    def _check_access(self, request):
        if not is_midwife_user(request.user):
            self.permission_denied(request, message='Only midwife accounts can access midwife billing.')

    def _queryset(self, request):
        return Payment.objects.select_related('patient').filter(
            created_by=request.user,
            department='Maternal care',
            notes__startswith='Midwife procedure:',
        ).order_by('-created_at')

    def _payment_data(self, payment, request):
        return PaymentSerializer(payment, context={'request': request}).data

    def _price(self, value):
        try:
            price = Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            raise serializers.ValidationError({'price': 'Enter a valid price.'})
        if price <= 0:
            raise serializers.ValidationError({'price': 'Price must be greater than zero.'})
        return price.quantize(Decimal('0.01'))

    def _procedure(self, value):
        procedure = str(value or '').strip()
        if procedure not in MIDWIFE_BILLING_PROCEDURES:
            raise serializers.ValidationError({'procedure': 'Select a valid procedure.'})
        return procedure

    def list(self, request):
        self._check_access(request)
        queryset = self._queryset(request)
        search = request.query_params.get('q', '').strip()
        status_filter = request.query_params.get('status', '').strip().lower()
        if search:
            queryset = queryset.filter(
                models.Q(patient__registration_number__icontains=search)
                | models.Q(patient__first_name__icontains=search)
                | models.Q(patient__last_name__icontains=search)
                | models.Q(service__icontains=search)
            )
        if status_filter in {Payment.Status.PENDING, Payment.Status.APPROVED}:
            queryset = queryset.filter(status=status_filter)

        try:
            page = max(1, int(request.query_params.get('page', '1')))
        except ValueError:
            page = 1
        total = queryset.count()
        start = (page - 1) * self.page_size
        results = queryset[start:start + self.page_size]
        return Response({
            'count': total,
            'next': page + 1 if start + self.page_size < total else None,
            'previous': page - 1 if page > 1 else None,
            'results': [self._payment_data(payment, request) for payment in results],
        })

    def create(self, request):
        self._check_access(request)
        patient = get_object_or_404(Patient, pk=request.data.get('patient'))
        procedure = self._procedure(request.data.get('procedure'))
        price = self._price(request.data.get('price'))
        payment = Payment.objects.create(
            patient=patient,
            service=MIDWIFE_BILLING_PROCEDURES[procedure],
            department='Maternal care',
            doctor_name='',
            patient_age=patient.age,
            patient_age_unit=patient.age_unit,
            doctor_fee=price,
            payment_type=Payment.PaymentType.FULL,
            discount_percentage=Decimal('0.00'),
            discount_amount=Decimal('0.00'),
            amount=round_up_to_ten(price),
            status=Payment.Status.PENDING,
            notes=f'Midwife procedure: {procedure}',
            created_by=request.user,
        )
        return Response(self._payment_data(payment, request), status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        self._check_access(request)
        payment = get_object_or_404(self._queryset(request), pk=pk)
        if payment.status == Payment.Status.APPROVED:
            raise serializers.ValidationError({'detail': 'Approved billing records cannot be edited.'})

        patient = payment.patient
        if 'patient' in request.data:
            patient = get_object_or_404(Patient, pk=request.data.get('patient'))
        procedure = self._procedure(request.data.get('procedure') or payment.notes.replace('Midwife procedure: ', ''))
        price = self._price(request.data.get('price', payment.doctor_fee))
        payment.patient = patient
        payment.patient_age = patient.age
        payment.patient_age_unit = patient.age_unit
        payment.service = MIDWIFE_BILLING_PROCEDURES[procedure]
        payment.doctor_fee = price
        payment.amount = round_up_to_ten(price)
        payment.notes = f'Midwife procedure: {procedure}'
        payment.save(update_fields=['patient', 'patient_age', 'patient_age_unit', 'service', 'doctor_fee', 'amount', 'notes', 'updated_at'])
        return Response(self._payment_data(payment, request))

    def destroy(self, request, pk=None):
        self._check_access(request)
        payment = get_object_or_404(self._queryset(request), pk=pk)
        if payment.status == Payment.Status.APPROVED:
            raise serializers.ValidationError({'detail': 'Approved billing records cannot be deleted.'})
        soft_delete_instance(payment, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MidwifeDashboardViewSet(viewsets.ViewSet):
    permission_classes = (IsAuthenticated,)

    def list(self, request):
        if not is_midwife_user(request.user):
            self.permission_denied(request, message='Only midwife accounts can access midwife APIs.')

        period = request.query_params.get('period', 'monthly')
        if period not in {'daily', 'weekly', 'monthly', 'annual'}:
            period = 'monthly'

        try:
            recent_page = max(1, int(request.query_params.get('recent_page', '1')))
        except ValueError:
            recent_page = 1

        start_at, period_label = dashboard_period_start(period)
        records = ClinicalDocument.objects.select_related('patient', 'created_by').filter(
            created_by=request.user,
            document_type=ClinicalDocument.DocumentType.ULTRASOUND,
            payload__midwife_record=True,
        )
        delivery_records = ClinicalDocument.objects.select_related('patient', 'created_by').filter(
            created_by=request.user,
            document_type=ClinicalDocument.DocumentType.ULTRASOUND,
            payload__delivery_record=True,
        )
        period_records = records.filter(created_at__gte=start_at)
        period_delivery_records = delivery_records.filter(created_at__gte=start_at)

        all_records = list(records.order_by('patient_id', '-created_at'))
        latest_records_by_patient: dict[int, ClinicalDocument] = {}
        for record in all_records:
            latest_records_by_patient.setdefault(record.patient_id, record)

        today = timezone.localdate()
        due_followups = sum(
            1
            for record in latest_records_by_patient.values()
            if (
                record.payload.get('patient_status') == 'follow_up'
                and (next_visit_date := parse_payload_date(record.payload, 'next_visit_date')) is not None
                and next_visit_date <= today
            )
        )

        recent_records_queryset = records.order_by('-created_at')
        recent_records_count = recent_records_queryset.count()
        page_size = 10
        start_index = (recent_page - 1) * page_size
        recent_records = recent_records_queryset[start_index:start_index + page_size]

        data = {
            'period': period,
            'period_label': period_label,
            'patients': period_records.values('patient').distinct().count(),
            'anc_visits': period_records.filter(payload__visit_type='anc').count(),
            'pnc_visits': period_records.filter(payload__visit_type='pnc').count(),
            'deliveries': period_delivery_records.count(),
            'high_risk': period_records.filter(payload__high_risk=True).count(),
            'due_followups': due_followups,
            'total_records': period_records.count(),
            'patient_trend': build_patient_trend(period, period_records),
            'recent_records_count': recent_records_count,
            'recent_records': recent_records,
        }
        serializer = MidwifeDashboardSerializer(instance=data, context={'request': request})
        return Response(serializer.data)
