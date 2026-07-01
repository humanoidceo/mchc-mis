from datetime import date, timedelta

from django.db import models
from django.db.models import Count
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.access import user_has_permission
from .models import ClinicalDocument, Patient
from .serializers import ClinicalDocumentSerializer, MidwifeDashboardSerializer, PatientSerializer


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

        queryset = Patient.objects.filter(payments__department__iexact='Maternal care').distinct().order_by('-created_at')
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
        period_records = records.filter(created_at__gte=start_at)

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
            'high_risk': period_records.filter(payload__high_risk=True).count(),
            'due_followups': due_followups,
            'total_records': period_records.count(),
            'patient_trend': build_patient_trend(period, period_records),
            'recent_records_count': recent_records_count,
            'recent_records': recent_records,
        }
        serializer = MidwifeDashboardSerializer(instance=data, context={'request': request})
        return Response(serializer.data)
