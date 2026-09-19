from datetime import date, datetime, time, timedelta
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
from .models import ClinicalDocument, DoctorDepartmentAssignment, Patient, Payment, round_up_to_ten
from .serializers import ClinicalDocumentSerializer, MidwifeDashboardSerializer, PatientSerializer, PaymentSerializer


MIDWIFE_BILLING_PROCEDURES = {
    'iud_insertion': 'Insertion of IUD',
    'iud_removal': 'Removal of IUD',
    'implant_insertion': 'Insertion of implant',
    'implant_removal': 'Removal of implant',
}


def is_midwife_user(user) -> bool:
    return user_has_permission(user, 'documents.ultrasound.create')


def dashboard_period_range(period: str, from_date_value: str = '', to_date_value: str = ''):
    now = timezone.localtime(timezone.now())
    if period == 'custom':
        try:
            start_date = date.fromisoformat(from_date_value)
            end_date = date.fromisoformat(to_date_value)
        except ValueError:
            raise serializers.ValidationError({'period': 'Choose valid From and To dates for the custom period.'})
        if end_date < start_date:
            raise serializers.ValidationError({'to': 'To date must be on or after From date.'})

        current_timezone = timezone.get_current_timezone()
        start_at = timezone.make_aware(datetime.combine(start_date, time.min), current_timezone)
        end_at = timezone.make_aware(datetime.combine(end_date + timedelta(days=1), time.min), current_timezone)
        return start_at, end_at, f'{start_date.isoformat()} to {end_date.isoformat()}'
    if period == 'annual':
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0), None, 'Annual'
    if period == 'monthly':
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), None, 'Monthly'
    if period == 'weekly':
        start = now - timedelta(days=now.weekday())
        return start.replace(hour=0, minute=0, second=0, microsecond=0), None, 'Weekly'
    return now.replace(hour=0, minute=0, second=0, microsecond=0), None, 'Daily'


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
            queryset = queryset.filter(payments__department__iexact='Midwifery').distinct()
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
            department='Midwifery',
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
            department='Midwifery',
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
        if period not in {'daily', 'weekly', 'monthly', 'annual', 'custom'}:
            period = 'monthly'

        start_at, end_at, period_label = dashboard_period_range(
            period,
            request.query_params.get('from', '').strip(),
            request.query_params.get('to', '').strip(),
        )
        doctor_documents = ClinicalDocument.objects.filter(
            created_by=request.user,
            created_at__gte=start_at,
            document_type__in=[
                ClinicalDocument.DocumentType.PRESCRIPTION,
                ClinicalDocument.DocumentType.LAB_ORDER,
            ],
        )
        assigned_payments = Payment.objects.filter(
            doctor_name__iexact=request.user.username,
            created_at__gte=start_at,
        )
        if end_at is not None:
            doctor_documents = doctor_documents.filter(created_at__lt=end_at)
            assigned_payments = assigned_payments.filter(created_at__lt=end_at)
        assigned_departments = list(
            DoctorDepartmentAssignment.objects.filter(doctor=request.user)
            .order_by('department')
            .values_list('department', flat=True)
        )
        assigned_department_counts = {department.casefold(): 0 for department in assigned_departments}
        for row in assigned_payments.values('department').annotate(patients=Count('patient_id', distinct=True)):
            normalized_department = (row['department'] or '').strip().casefold()
            if normalized_department in assigned_department_counts:
                assigned_department_counts[normalized_department] = row['patients']

        data = {
            'period': period,
            'period_label': period_label,
            'patients': assigned_payments.values('patient_id').distinct().count(),
            'approved_patients': assigned_payments.filter(status=Payment.Status.APPROVED).values('patient_id').distinct().count(),
            'pending_patients': assigned_payments.filter(status=Payment.Status.PENDING).values('patient_id').distinct().count(),
            'prescriptions': doctor_documents.filter(document_type=ClinicalDocument.DocumentType.PRESCRIPTION).count(),
            'laboratory_orders': doctor_documents.filter(document_type=ClinicalDocument.DocumentType.LAB_ORDER).count(),
            'doctor_departments': [
                {'department': department, 'patients': assigned_department_counts[department.casefold()]}
                for department in assigned_departments
            ],
        }
        serializer = MidwifeDashboardSerializer(instance=data, context={'request': request})
        return Response(serializer.data)
