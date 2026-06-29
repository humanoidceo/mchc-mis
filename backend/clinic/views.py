from django.utils import timezone
from django.db.models import F
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.access import get_user_permissions, user_has_permission
from .models import ClinicalDocument, Medicine, MedicineStockMovement, Patient, Payment
from .serializers import (
    ClinicalDocumentSerializer,
    MedicineSerializer,
    MedicineStockMovementSerializer,
    PatientSerializer,
    PaymentSerializer,
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
        serializer.save(registered_by=self.request.user)


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
    }

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

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
        if document_type:
            queryset = queryset.filter(document_type=document_type)
        return queryset

    def get_required_permission(self) -> str | None:
        if self.action in {'list', 'retrieve'}:
            return None
        document_type = self.request.data.get('document_type')
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
    permission_map = {'*': 'stock.manage'}


class MedicineStockMovementViewSet(PermissionedModelViewSet):
    queryset = MedicineStockMovement.objects.select_related('medicine', 'created_by')
    serializer_class = MedicineStockMovementSerializer
    permission_map = {'*': 'stock.manage'}

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class DashboardViewSet(viewsets.ViewSet):
    permission_classes = (IsAuthenticated,)

    def list(self, request):
        return Response(
            {
                'patients': Patient.objects.count(),
                'pending_payments': Payment.objects.filter(status=Payment.Status.PENDING).count(),
                'approved_payments': Payment.objects.filter(status=Payment.Status.APPROVED).count(),
                'documents': ClinicalDocument.objects.count(),
                'low_stock_medicines': Medicine.objects.filter(current_stock__lte=F('low_stock_threshold')).count(),
            }
        )
