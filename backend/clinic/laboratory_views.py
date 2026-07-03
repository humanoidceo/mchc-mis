from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.access import user_has_permission
from accounts.permissions import Role

from .laboratory_serializers import (
    LaboratoryBillCreateSerializer,
    LaboratoryBillSerializer,
    LaboratoryDashboardSerializer,
    LaboratoryPatientSearchSerializer,
    LaboratoryOrderSerializer,
    LaboratoryResultUpdateSerializer,
    expand_lab_test_selection,
    latest_lab_order_for_patient,
    serialize_lab_order_items,
)
from .models import ClinicalDocument, Patient, Payment


def is_laboratory_user(user) -> bool:
    profile = getattr(user, 'staff_profile', None)
    role = getattr(profile, 'role', None)
    return bool(
        user
        and user.is_authenticated
        and (
            user.is_superuser
            or role in {Role.SUPER_ADMIN, Role.LABORATORY}
            or user_has_permission(user, 'documents.lab_bill.create')
        )
    )


def next_patient_registration_number() -> str:
    numeric_registration_numbers = [
        int(registration_number)
        for registration_number in Patient.objects.select_for_update().values_list('registration_number', flat=True)
        if registration_number.isdigit()
    ]
    return str(max(numeric_registration_numbers, default=0) + 1)


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


def build_patient_trend(period: str, bills_queryset):
    now = timezone.localtime(timezone.now())

    if period == 'annual':
        month_rows = (
            bills_queryset
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
        labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    elif period == 'monthly':
        start = now.replace(day=1)
        bucket_count = now.day
        labels = None
    else:
        return []

    start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    day_rows = (
        bills_queryset
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
    return [
        {
            'label': labels[index] if labels else str((start + timedelta(days=index)).day),
            'value': counts.get((start + timedelta(days=index)).date(), 0),
        }
        for index in range(bucket_count)
    ]


class LaboratoryBaseViewSet(viewsets.GenericViewSet):
    permission_classes = (IsAuthenticated,)

    def check_permissions(self, request):
        super().check_permissions(request)
        if not is_laboratory_user(request.user):
            self.permission_denied(request, message='Only laboratory accounts can access laboratory APIs.')


class LaboratoryDashboardViewSet(mixins.ListModelMixin, LaboratoryBaseViewSet):
    serializer_class = LaboratoryDashboardSerializer

    def list(self, request, *args, **kwargs):
        period = request.query_params.get('period', 'monthly')
        if period not in {'daily', 'weekly', 'monthly', 'annual'}:
            period = 'monthly'
        try:
            recent_page = max(1, int(request.query_params.get('recent_page', '1')))
        except ValueError:
            recent_page = 1
        start_at, period_label = dashboard_period_start(period)
        bills_queryset = ClinicalDocument.objects.filter(
            document_type=ClinicalDocument.DocumentType.LAB_BILL,
            created_by=request.user,
        ).select_related('payment')
        recent_bills_count = bills_queryset.count()
        page_size = 10
        recent_bills = list(
            bills_queryset
            .select_related('patient', 'payment')
            .order_by('-created_at')[(recent_page - 1) * page_size:recent_page * page_size]
        )
        period_bills = bills_queryset.filter(created_at__gte=start_at)
        pending_reception = period_bills.filter(payment__status=Payment.Status.PENDING).count()
        approved_reception = period_bills.filter(payment__status=Payment.Status.APPROVED).count()
        total_amount = period_bills.aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')
        internal_patients = period_bills.filter(payload__customer_type='internal').aggregate(total=Count('patient', distinct=True))['total'] or 0
        external_patients = period_bills.filter(Q(payload__customer_type='external') | Q(payload__customer_type__isnull=True)).aggregate(total=Count('patient', distinct=True))['total'] or 0
        patient_trend = build_patient_trend(period, period_bills)
        internal_amount = period_bills.filter(payload__customer_type='internal').aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')
        external_amount = period_bills.filter(Q(payload__customer_type='external') | Q(payload__customer_type__isnull=True)).aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')
        full_paid_amount = period_bills.filter(payment__payment_type=Payment.PaymentType.FULL).aggregate(total=Sum('payment__amount'))['total'] or Decimal('0.00')
        discounted_amount = period_bills.filter(payment__payment_type=Payment.PaymentType.DISCOUNT).aggregate(total=Sum('payment__amount'))['total'] or Decimal('0.00')
        free_amount = period_bills.filter(payment__payment_type=Payment.PaymentType.FREE).aggregate(total=Sum('payment__amount'))['total'] or Decimal('0.00')
        pending_reception_amount = period_bills.filter(payment__status=Payment.Status.PENDING).aggregate(total=Sum('payment__amount'))['total'] or Decimal('0.00')
        approved_reception_amount = period_bills.filter(payment__status=Payment.Status.APPROVED).aggregate(total=Sum('payment__amount'))['total'] or Decimal('0.00')

        serializer = self.get_serializer(
            {
                'period': period,
                'period_label': period_label,
                'pending_lab_orders': ClinicalDocument.objects.filter(
                    document_type=ClinicalDocument.DocumentType.LAB_ORDER
                ).count(),
                'bills_created': period_bills.count(),
                'internal_patients': internal_patients,
                'internal_amount': internal_amount,
                'external_patients': external_patients,
                'external_amount': external_amount,
                'full_paid': period_bills.filter(payment__payment_type=Payment.PaymentType.FULL).count(),
                'full_paid_amount': full_paid_amount,
                'discounted': period_bills.filter(payment__payment_type=Payment.PaymentType.DISCOUNT).count(),
                'discounted_amount': discounted_amount,
                'free': period_bills.filter(payment__payment_type=Payment.PaymentType.FREE).count(),
                'free_amount': free_amount,
                'pending_reception_payments': pending_reception,
                'pending_reception_amount': pending_reception_amount,
                'approved_reception_payments': approved_reception,
                'approved_reception_amount': approved_reception_amount,
                'monthly_amount': total_amount,
                'patient_trend': patient_trend,
                'recent_bills_count': recent_bills_count,
                'recent_bills': recent_bills,
            }
        )
        return Response(serializer.data)


class LaboratoryPatientViewSet(LaboratoryBaseViewSet, mixins.ListModelMixin):
    serializer_class = LaboratoryPatientSearchSerializer

    def get_queryset(self):
        queryset = (
            Patient.objects.filter(documents__document_type=ClinicalDocument.DocumentType.LAB_ORDER)
            .distinct()
            .order_by('-created_at')
        )
        search = self.request.query_params.get('q', '').strip()
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
            offset = max(0, int(request.query_params.get('offset', '0')))
        except ValueError:
            offset = 0
        limit = 5
        total = queryset.count()
        results = queryset[offset:offset + limit]
        next_offset = offset + limit if offset + limit < total else None
        return Response(
            {
                'results': self.get_serializer(results, many=True).data,
                'next_offset': next_offset,
            }
        )

    @action(detail=True, methods=['get'], url_path='latest-order')
    def latest_order(self, request, pk=None):
        order = latest_lab_order_for_patient(pk)
        if not order:
            return Response(
                {'detail': 'No saved lab order was found for this patient. The doctor must create and save a lab order first.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = LaboratoryOrderSerializer(
            {
                'id': order.id,
                'title': order.title,
                'created_at': order.created_at,
                'patient': order.patient_id,
                'patient_name': f'{order.patient.first_name} {order.patient.last_name}'.strip(),
                'items': serialize_lab_order_items(order),
            }
        )
        return Response(serializer.data)


class LaboratoryBillViewSet(
    LaboratoryBaseViewSet,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
):
    serializer_class = LaboratoryBillSerializer

    def get_queryset(self):
        queryset = (
            ClinicalDocument.objects.filter(
                document_type=ClinicalDocument.DocumentType.LAB_BILL,
                created_by=self.request.user,
            )
            .select_related('patient', 'payment')
            .order_by('-created_at')
        )
        search = self.request.query_params.get('q', '').strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(patient__first_name__icontains=search)
                | Q(patient__last_name__icontains=search)
                | Q(patient__registration_number__icontains=search)
            )
        return queryset

    def get_serializer_class(self):
        if self.action == 'create':
            return LaboratoryBillCreateSerializer
        return LaboratoryBillSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            customer_type = serializer.validated_data['customer_type']
            if customer_type == 'internal':
                patient = Patient.objects.filter(pk=serializer.validated_data['patient']).first()
                if patient is None:
                    raise serializers.ValidationError({'patient': 'Selected patient was not found.'})
                order_id = serializer.validated_data.get('lab_order_document')
                if order_id:
                    order = ClinicalDocument.objects.filter(
                        pk=order_id,
                        patient=patient,
                        document_type=ClinicalDocument.DocumentType.LAB_ORDER,
                    ).first()
                else:
                    order = latest_lab_order_for_patient(patient.id)
                if order is None:
                    raise serializers.ValidationError({'patient': 'This patient has no saved lab order.'})
                customer_name = f'{patient.first_name} {patient.last_name}'.strip()
            else:
                customer_name = serializer.validated_data.get('customer_name', '').strip()
                patient = Patient.objects.create(
                    registration_number=next_patient_registration_number(),
                    first_name=customer_name,
                    last_name='',
                    age=None,
                    gender=Patient.Gender.OTHER,
                    date_of_birth=None,
                    phone='',
                    address='',
                    guardian_name='',
                    registered_by=request.user,
                )
                order = None

            items = []
            result_items = []
            total_amount = Decimal('0.00')
            for item in serializer.validated_data['items']:
                cost = item['cost']
                total_amount += cost
                ordered_item, expanded_result_items = expand_lab_test_selection(
                    test_id=item['test'],
                    test_name=item['test_name'],
                    instructions=item.get('instructions', ''),
                    cost=cost,
                )
                items.append(ordered_item)
                result_items.extend(expanded_result_items)

            payment = Payment.objects.create(
                patient=patient,
                service='Laboratory bill',
                department='Laboratory',
                doctor_name='',
                patient_age=patient.age,
                doctor_fee=total_amount,
                payment_type=Payment.PaymentType.FULL,
                discount_percentage=Decimal('0.00'),
                discount_amount=Decimal('0.00'),
                amount=total_amount,
                status=Payment.Status.PENDING,
                notes=f'Laboratory {customer_type} bill',
                created_by=request.user,
            )

            document = ClinicalDocument.objects.create(
                patient=patient,
                document_type=ClinicalDocument.DocumentType.LAB_BILL,
                title='Laboratory bill',
                payload={
                    'customer_type': customer_type,
                    'customer_name': customer_name,
                    'lab_order_document': order.id if order else None,
                    'ordered_items': items,
                    'result_items': result_items,
                },
                total_amount=total_amount,
                payment=payment,
                created_by=request.user,
            )

        output = LaboratoryBillSerializer(document, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='results')
    def results(self, request, pk=None):
        document = self.get_object()
        if document.payment is None or document.payment.status != Payment.Status.APPROVED:
            raise serializers.ValidationError({'payment': 'Reception must approve this laboratory bill before results can be entered.'})

        serializer = LaboratoryResultUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payload = document.payload if isinstance(document.payload, dict) else {}
        current_items = payload.get('result_items')
        legacy_mode = False
        if not isinstance(current_items, list):
            current_items = payload.get('items')
            legacy_mode = isinstance(current_items, list)
        if not isinstance(current_items, list):
            raise serializers.ValidationError({'items': 'This laboratory bill has no result rows to update.'})

        results_by_test = {item['test']: item['result'] for item in serializer.validated_data['items']}
        updated_items = []
        for item in current_items:
            if not isinstance(item, dict):
                continue
            test_id = item.get('test')
            next_item = dict(item)
            if isinstance(test_id, int) and test_id in results_by_test:
                next_item['result'] = results_by_test[test_id]
            updated_items.append(next_item)

        if legacy_mode:
            payload['items'] = updated_items
        else:
            payload['result_items'] = updated_items
        document.payload = payload
        document.save(update_fields=['payload', 'updated_at'])

        output = LaboratoryBillSerializer(document, context=self.get_serializer_context())
        return Response(output.data)

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        with transaction.atomic():
            payment = document.payment
            document.delete()
            if payment is not None:
                payment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
