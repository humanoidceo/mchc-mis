from decimal import Decimal

from django.db import transaction
from django.db.models import Q
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
    latest_lab_order_for_patient,
    resolve_lab_test_reference,
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


def lab_test_snapshot(test_id: int, test_name: str, instructions: str, cost: Decimal):
    test = resolve_lab_test_reference(test_id, test_name)
    return {
        'test': test_id,
        'test_name': test.name if test else test_name,
        'instructions': instructions,
        'cost': str(cost),
        'normal_range_from': test.normal_range_from if test else '',
        'normal_range_to': test.normal_range_to if test else '',
        'unit': test.unit if test else '',
        'result': '',
    }


class LaboratoryBaseViewSet(viewsets.GenericViewSet):
    permission_classes = (IsAuthenticated,)

    def check_permissions(self, request):
        super().check_permissions(request)
        if not is_laboratory_user(request.user):
            self.permission_denied(request, message='Only laboratory accounts can access laboratory APIs.')


class LaboratoryDashboardViewSet(mixins.ListModelMixin, LaboratoryBaseViewSet):
    serializer_class = LaboratoryDashboardSerializer

    def list(self, request, *args, **kwargs):
        month_start = timezone.localtime().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        recent_bills = list(
            ClinicalDocument.objects.filter(
                document_type=ClinicalDocument.DocumentType.LAB_BILL,
                created_by=request.user,
            )
            .select_related('patient', 'payment')
            .order_by('-created_at')[:6]
        )
        bills_queryset = ClinicalDocument.objects.filter(
            document_type=ClinicalDocument.DocumentType.LAB_BILL,
            created_by=request.user,
        ).select_related('payment')
        pending_reception = bills_queryset.filter(payment__status=Payment.Status.PENDING).count()
        approved_reception = bills_queryset.filter(payment__status=Payment.Status.APPROVED).count()
        month_total = sum((document.total_amount for document in bills_queryset.filter(created_at__gte=month_start)), Decimal('0.00'))

        serializer = self.get_serializer(
            {
                'pending_lab_orders': ClinicalDocument.objects.filter(
                    document_type=ClinicalDocument.DocumentType.LAB_ORDER
                ).count(),
                'bills_created': bills_queryset.count(),
                'pending_reception_payments': pending_reception,
                'approved_reception_payments': approved_reception,
                'monthly_amount': month_total,
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
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
):
    serializer_class = LaboratoryBillSerializer

    def get_queryset(self):
        return (
            ClinicalDocument.objects.filter(
                document_type=ClinicalDocument.DocumentType.LAB_BILL,
                created_by=self.request.user,
            )
            .select_related('patient', 'payment')
            .order_by('-created_at')
        )

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
            total_amount = Decimal('0.00')
            for item in serializer.validated_data['items']:
                cost = item['cost']
                total_amount += cost
                items.append(
                    lab_test_snapshot(
                        test_id=item['test'],
                        test_name=item['test_name'],
                        instructions=item.get('instructions', ''),
                        cost=cost,
                    )
                )

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
                    'items': items,
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
        current_items = payload.get('items')
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

        payload['items'] = updated_items
        document.payload = payload
        document.save(update_fields=['payload', 'updated_at'])

        output = LaboratoryBillSerializer(document, context=self.get_serializer_context())
        return Response(output.data)
