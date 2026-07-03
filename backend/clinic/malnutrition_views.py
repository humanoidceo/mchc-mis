from datetime import timedelta

from django.db import models
from django.db.models import Count
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.access import user_has_permission
from .models import ClinicalDocument, Patient
from .serializers import ClinicalDocumentSerializer, MalnutritionDashboardSerializer, PatientSerializer


def is_malnutrition_user(user) -> bool:
    return user_has_permission(user, 'documents.rutf.create')


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
            {'label': month_label, 'value': counts.get(index, 0)}
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
    counts = {row['bucket']: row['value'] for row in day_rows if row['bucket'] is not None}
    labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] if period == 'weekly' else None
    return [
        {
            'label': labels[index] if labels else str((start + timedelta(days=index)).day),
            'value': counts.get((start + timedelta(days=index)).date(), 0),
        }
        for index in range(bucket_count)
    ]


class MalnutritionPatientViewSet(viewsets.ViewSet):
    permission_classes = (IsAuthenticated,)

    def list(self, request):
        if not is_malnutrition_user(request.user):
            self.permission_denied(request, message='Only malnutrition accounts can access malnutrition APIs.')

        search = request.query_params.get('q', '').strip()
        try:
            offset = max(0, int(request.query_params.get('offset', '0')))
        except ValueError:
            offset = 0

        queryset = Patient.objects.filter(payments__department__iexact='Malnutrition').distinct().order_by('-created_at')
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


class MalnutritionDashboardViewSet(viewsets.ViewSet):
    permission_classes = (IsAuthenticated,)

    def list(self, request):
        if not is_malnutrition_user(request.user):
            self.permission_denied(request, message='Only malnutrition accounts can access malnutrition APIs.')

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
            document_type=ClinicalDocument.DocumentType.RUTF,
            payload__malnutrition_record=True,
        )
        period_records = records.filter(created_at__gte=start_at)

        recent_records_queryset = records.order_by('-created_at')
        recent_records_count = recent_records_queryset.count()
        page_size = 10
        start_index = (recent_page - 1) * page_size
        recent_records = recent_records_queryset[start_index:start_index + page_size]

        severe_cases = period_records.filter(payload__nutrition_status='severe').count()
        moderate_cases = period_records.filter(payload__nutrition_status='moderate').count()
        edema_cases = period_records.filter(payload__bilateral_edema='yes').count()
        appetite_failures = period_records.filter(payload__appetite_test='fail').count()
        pending_pharmacy = period_records.exclude(payload__pharmacy_status='approved').count()
        approved_pharmacy = period_records.filter(payload__pharmacy_status='approved').count()

        data = {
            'period': period,
            'period_label': period_label,
            'patients': period_records.values('patient').distinct().count(),
            'severe_cases': severe_cases,
            'moderate_cases': moderate_cases,
            'edema_cases': edema_cases,
            'appetite_failures': appetite_failures,
            'pending_pharmacy': pending_pharmacy,
            'approved_pharmacy': approved_pharmacy,
            'total_records': period_records.count(),
            'patient_trend': build_patient_trend(period, period_records),
            'recent_records_count': recent_records_count,
            'recent_records': recent_records,
        }
        serializer = MalnutritionDashboardSerializer(instance=data, context={'request': request})
        return Response(serializer.data)
