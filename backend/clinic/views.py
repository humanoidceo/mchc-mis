from datetime import datetime, timedelta
from decimal import Decimal
from collections import defaultdict
import os
from pathlib import Path
import subprocess
import tempfile
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from django.conf import settings
from django.http import FileResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncDate, TruncMonth
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.access import get_user_permissions, user_has_permission
from accounts.trash import cleanup_expired_trash, soft_delete_instance
from accounts.models import Employee, StaffProfile
from accounts.permissions import Role
from config.pagination import StandardResultsSetPagination
from pharmacy.models import Medicine as PharmacyMedicine
from .models import AuditLog, CashBankTransaction, ClinicalDocument, DoctorDepartmentAssignment, Expense, ExpenseCategory, ExpenseSubcategory, LabTest, Medicine, MedicineStockMovement, Patient, Payment, PrivateDocument, SalaryAdvance, SalaryAdvanceSettlement, SalaryPayment, WebsiteGalleryImage, WebsitePageContent, WebsitePost, WebsitePostImage, WebsiteSettings
from .salary_rules import AFGHAN_MONTHS, current_afghan_date, money
from .serializers import (
    ClinicalDocumentSerializer,
    CashBankTransactionSerializer,
    AuditLogSerializer,
    ASSIGNABLE_CLINICAL_ROLES,
    DoctorDepartmentAssignmentSerializer,
    ExpenseSerializer,
    ExpenseCategorySerializer,
    LabTestSerializer,
    MedicineSerializer,
    MedicineStockMovementSerializer,
    PatientSerializer,
    PaymentSerializer,
    PrivateDocumentSerializer,
    SalaryAdvanceSerializer,
    SalaryPaymentSerializer,
    WebsitePageContentSerializer,
    WebsiteGalleryImageSerializer,
    WebsitePostSerializer,
    WebsiteSettingsSerializer,
    compress_website_post_image,
)


DOCUMENT_CREATE_PERMISSIONS = {
    ClinicalDocument.DocumentType.PRESCRIPTION: 'documents.prescription.create',
    ClinicalDocument.DocumentType.LAB_ORDER: 'documents.lab_order.create',
    ClinicalDocument.DocumentType.LAB_BILL: 'documents.lab_bill.create',
    ClinicalDocument.DocumentType.MEDICINE_BILL: 'documents.medicine_bill.create',
    ClinicalDocument.DocumentType.ULTRASOUND: 'documents.ultrasound.create',
    ClinicalDocument.DocumentType.FAMILY_PLANNING: 'documents.family_planning.create',
    ClinicalDocument.DocumentType.VACCINATION: 'documents.vaccination.create',
    ClinicalDocument.DocumentType.RUTF: 'documents.rutf.create',
}

RECEPTION_DOCTOR_DEPARTMENTS = {'midwifery', 'ultrasound', 'opd', 'pediatrics', 'gynecology'}


class DeleteAfterClose:
    def __init__(self, path: str):
        self.path = path
        self.file = open(path, 'rb')

    def read(self, *args, **kwargs):
        return self.file.read(*args, **kwargs)

    def __getattr__(self, name):
        return getattr(self.file, name)

    def close(self):
        try:
            self.file.close()
        finally:
            try:
                os.unlink(self.path)
            except FileNotFoundError:
                pass


def xlsx_column_name(column_index: int) -> str:
    """Return an Excel column name for a one-based column index."""
    result = ''
    while column_index:
        column_index, remainder = divmod(column_index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def xlsx_safe_text(value) -> str:
    value = '' if value is None else str(value)
    # Prevent text entered in the application from becoming an Excel formula.
    return f"'{value}" if value.startswith(('=', '+', '-', '@')) else value


def build_xlsx_cell(cell_reference: str, value, *, is_header: bool = False) -> str:
    style_attribute = ' s="1"' if is_header else ''
    if isinstance(value, (Decimal, int, float)) and not isinstance(value, bool):
        numeric_value = format(value, 'f') if isinstance(value, Decimal) else str(value)
        return f'<c r="{cell_reference}"{style_attribute}><v>{numeric_value}</v></c>'
    return (
        f'<c r="{cell_reference}" t="inlineStr"{style_attribute}>'
        f'<is><t>{escape(xlsx_safe_text(value))}</t></is>'
        '</c>'
    )


def write_xlsx_workbook(path: str, worksheet_name: str, rows) -> None:
    """Write an XLSX file without retaining its data rows in application memory."""
    safe_sheet_name = ''.join(character for character in worksheet_name if character not in '\\/*?:[]')[:31] or 'Sheet1'
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        '</Types>'
    )
    root_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>'
    )
    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets><sheet name="{escape(safe_sheet_name)}" sheetId="1" r:id="rId1"/></sheets>'
        '</workbook>'
    )
    workbook_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '</Relationships>'
    )
    styles_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        '</styleSheet>'
    )

    with ZipFile(path, 'w', compression=ZIP_DEFLATED, allowZip64=True) as workbook:
        workbook.writestr('[Content_Types].xml', content_types_xml)
        workbook.writestr('_rels/.rels', root_rels_xml)
        workbook.writestr('xl/workbook.xml', workbook_xml)
        workbook.writestr('xl/_rels/workbook.xml.rels', workbook_rels_xml)
        workbook.writestr('xl/styles.xml', styles_xml)
        with workbook.open('xl/worksheets/sheet1.xml', 'w') as worksheet:
            worksheet.write(
                b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                b'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
            )
            for row_index, row in enumerate(rows, start=1):
                cells = ''.join(
                    build_xlsx_cell(
                        f'{xlsx_column_name(column_index)}{row_index}',
                        value,
                        is_header=row_index == 1,
                    )
                    for column_index, value in enumerate(row, start=1)
                )
                worksheet.write(f'<row r="{row_index}">{cells}</row>'.encode('utf-8'))
            worksheet.write(b'</sheetData></worksheet>')


def parse_expense_date_range(request):
    raw_from = request.query_params.get('from', '').strip()
    raw_to = request.query_params.get('to', '').strip()
    date_from = parse_date(raw_from) if raw_from else None
    date_to = parse_date(raw_to) if raw_to else None
    if raw_from and date_from is None:
        raise serializers.ValidationError({'from': 'Use a valid From date.'})
    if raw_to and date_to is None:
        raise serializers.ValidationError({'to': 'Use a valid To date.'})
    if date_from and date_to and date_from > date_to:
        raise serializers.ValidationError({'to': 'The To date must be on or after the From date.'})

    current_timezone = timezone.get_current_timezone()
    start_at = timezone.make_aware(datetime.combine(date_from, datetime.min.time()), current_timezone) if date_from else None
    end_at = timezone.make_aware(datetime.combine(date_to + timedelta(days=1), datetime.min.time()), current_timezone) if date_to else None
    return date_from, date_to, start_at, end_at


def can_download_database_backup(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user_has_permission(user, 'database.backup'):
        return True
    profile = getattr(user, 'staff_profile', None)
    return bool(profile and profile.role in {Role.SUPER_ADMIN, Role.RECEPTIONIST})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def database_backup(request):
    if not can_download_database_backup(request.user):
        return Response({'detail': 'Missing permission: database.backup'}, status=status.HTTP_403_FORBIDDEN)

    database = settings.DATABASES['default']
    if database.get('ENGINE') != 'django.db.backends.mysql':
        return Response({'detail': 'Database backup is available only for MySQL.'}, status=status.HTTP_400_BAD_REQUEST)

    database_name = str(database.get('NAME') or '')
    database_user = str(database.get('USER') or '')
    database_password = str(database.get('PASSWORD') or '')
    database_host = str(database.get('HOST') or '127.0.0.1')
    database_port = str(database.get('PORT') or '3306')
    if not database_name or not database_user:
        return Response({'detail': 'Database backup configuration is incomplete.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    timestamp = timezone.localtime(timezone.now()).strftime('%Y%m%d-%H%M%S')
    filename = f'mchc-mis-db-backup-{timestamp}.sql'
    temporary_file = tempfile.NamedTemporaryFile(delete=False, suffix='.sql')
    temporary_path = temporary_file.name

    command = [
        'mysqldump',
        '--single-transaction',
        '--quick',
        '--routines',
        '--triggers',
        '--events',
        '--default-character-set=utf8mb4',
        '--host',
        database_host,
        '--port',
        database_port,
        '--user',
        database_user,
        database_name,
    ]
    environment = os.environ.copy()
    if database_password:
        environment['MYSQL_PWD'] = database_password

    try:
        with temporary_file:
            completed = subprocess.run(
                command,
                stdout=temporary_file,
                stderr=subprocess.PIPE,
                text=True,
                env=environment,
                timeout=300,
                check=False,
            )
        if completed.returncode != 0:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass
            return Response({'detail': 'Unable to create database backup.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except (OSError, subprocess.TimeoutExpired):
        try:
            os.unlink(temporary_path)
        except FileNotFoundError:
            pass
        return Response({'detail': 'Unable to create database backup.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    response = FileResponse(DeleteAfterClose(temporary_path), as_attachment=True, filename=filename, content_type='application/sql')
    response['Cache-Control'] = 'no-store'
    return response


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


def resolve_dashboard_period(period: str, from_date_raw: str, to_date_raw: str):
    if period == 'custom':
        start_date = parse_date(from_date_raw)
        end_date = parse_date(to_date_raw)
        errors: dict[str, str] = {}
        if start_date is None:
            errors['from'] = 'Select a valid from date.'
        if end_date is None:
            errors['to'] = 'Select a valid to date.'
        if errors:
            raise serializers.ValidationError(errors)
        if end_date < start_date:
            raise serializers.ValidationError({'to': 'To date must be on or after from date.'})

        current_timezone = timezone.get_current_timezone()
        start_at = timezone.make_aware(datetime.combine(start_date, datetime.min.time()), current_timezone)
        end_at = timezone.make_aware(datetime.combine(end_date + timedelta(days=1), datetime.min.time()), current_timezone)
        return start_at, end_at, f'Custom ({start_date.isoformat()} to {end_date.isoformat()})'

    start_at, period_label = dashboard_period_start(period)
    return start_at, None, period_label


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
        for registration_number in Patient.all_objects.select_for_update().values_list('registration_number', flat=True)
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
        cleanup_expired_trash()
        super().check_permissions(request)
        code = self.get_required_permission()
        if code and not user_has_permission(request.user, code):
            self.permission_denied(request, message=f'Missing permission: {code}')


class DoctorDepartmentAssignmentViewSet(PermissionedModelViewSet):
    queryset = DoctorDepartmentAssignment.objects.select_related('doctor', 'assigned_by')
    serializer_class = DoctorDepartmentAssignmentSerializer
    pagination_class = StandardResultsSetPagination
    permission_map = {'*': 'patients.register'}

    @action(detail=False, methods=['get'], url_path='available-doctors')
    def available_doctors(self, request):
        query = request.query_params.get('q', '').strip()
        try:
            page = max(1, int(request.query_params.get('page', '1')))
        except (TypeError, ValueError):
            page = 1
        page_size = 5
        profiles = (
            StaffProfile.objects.select_related('user')
            .filter(role__in=ASSIGNABLE_CLINICAL_ROLES, deleted_at__isnull=True, user__is_active=True)
            .order_by('user__first_name', 'user__last_name', 'user__username')
        )
        if query:
            profiles = profiles.filter(
                Q(user__username__icontains=query)
                | Q(user__first_name__icontains=query)
                | Q(user__last_name__icontains=query)
            )

        total = profiles.count()
        start = (page - 1) * page_size
        results = profiles[start:start + page_size]
        return Response({
            'count': total,
            'next': f'?page={page + 1}' if start + page_size < total else None,
            'previous': f'?page={page - 1}' if page > 1 else None,
            'results': [
                {
                    'id': profile.user_id,
                    'username': profile.user.username,
                    'full_name': profile.user.get_full_name() or profile.user.username,
                    'role': profile.role,
                    'role_label': profile.get_role_display(),
                }
                for profile in results
            ],
        })

    @action(detail=False, methods=['get'], url_path='department-staff')
    def department_staff(self, request):
        department = request.query_params.get('department', '').strip()
        query = request.query_params.get('q', '').strip()
        try:
            page = max(1, int(request.query_params.get('page', '1')))
        except (TypeError, ValueError):
            page = 1
        page_size = 5

        if department.lower() not in RECEPTION_DOCTOR_DEPARTMENTS:
            return Response({'count': 0, 'next': None, 'previous': None, 'results': []})

        assignments = (
            DoctorDepartmentAssignment.objects.select_related('doctor', 'doctor__staff_profile')
            .filter(
                department__iexact=department,
                doctor__is_active=True,
                doctor__staff_profile__deleted_at__isnull=True,
                doctor__staff_profile__role__in=ASSIGNABLE_CLINICAL_ROLES,
            )
            .order_by('doctor__first_name', 'doctor__last_name', 'doctor__username')
        )
        if query:
            assignments = assignments.filter(
                Q(doctor__username__icontains=query)
                | Q(doctor__first_name__icontains=query)
                | Q(doctor__last_name__icontains=query)
            )

        total = assignments.count()
        start = (page - 1) * page_size
        results = assignments[start:start + page_size]
        return Response({
            'count': total,
            'next': f'?page={page + 1}' if start + page_size < total else None,
            'previous': f'?page={page - 1}' if page > 1 else None,
            'results': [
                {
                    'id': assignment.doctor_id,
                    'username': assignment.doctor.username,
                    'full_name': assignment.doctor.get_full_name() or assignment.doctor.username,
                    'role': assignment.doctor.staff_profile.role,
                    'role_label': assignment.doctor.staff_profile.get_role_display(),
                }
                for assignment in results
            ],
        })

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)


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

    def perform_destroy(self, instance):
        soft_delete_instance(instance, self.request.user)

    @action(detail=False, methods=['get'])
    def search(self, request):
        return search_response(self.get_queryset(), self.get_serializer_class(), request, ('registration_number', 'first_name', 'last_name'))


class PaymentViewSet(PermissionedModelViewSet):
    queryset = Payment.objects.select_related('patient', 'created_by', 'approved_by')
    serializer_class = PaymentSerializer
    pagination_class = StandardResultsSetPagination
    permission_map = {
        '*': 'payments.view',
        'create': 'payments.approve',
        'update': 'payments.approve',
        'partial_update': 'payments.approve',
        'destroy': 'payments.approve',
        'approve': 'payments.approve',
        'reception_bill': 'payments.approve',
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('q', '').strip()
        from_date_raw = self.request.query_params.get('from', '').strip()
        to_date_raw = self.request.query_params.get('to', '').strip()
        if search:
            search_condition = (
                Q(patient__registration_number__icontains=search)
                | Q(patient__first_name__icontains=search)
                | Q(patient__last_name__icontains=search)
                | Q(department__icontains=search)
                | Q(service__icontains=search)
                | Q(payment_type__icontains=search)
                | Q(status__icontains=search)
                | Q(notes__icontains=search)
            )
            if search.isdigit():
                search_condition |= Q(patient__id=int(search))
            queryset = queryset.filter(search_condition)
        from_date = parse_date(from_date_raw) if from_date_raw else None
        to_date = parse_date(to_date_raw) if to_date_raw else None
        if from_date and to_date and to_date < from_date:
            return queryset.none()
        if from_date is not None:
            queryset = queryset.filter(created_at__date__gte=from_date)
        if to_date is not None:
            queryset = queryset.filter(created_at__date__lte=to_date)
        return queryset

    @action(detail=False, methods=['get'], url_path='reception-report')
    def reception_report(self, request):
        from_date_raw = request.query_params.get('from', '').strip()
        to_date_raw = request.query_params.get('to', '').strip()
        from_date = parse_date(from_date_raw)
        to_date = parse_date(to_date_raw)
        errors: dict[str, str] = {}

        if from_date is None:
            errors['from'] = 'Select a valid from date.'
        if to_date is None:
            errors['to'] = 'Select a valid to date.'
        if errors:
            raise serializers.ValidationError(errors)
        if to_date < from_date:
            raise serializers.ValidationError({'to': 'To date must be on or after from date.'})

        queryset = super().get_queryset().filter(
            created_at__date__gte=from_date,
            created_at__date__lte=to_date,
            status=Payment.Status.APPROVED,
        )
        patient_count = queryset.values('patient_id').distinct().count()
        department_buckets: dict[str, dict[str, object]] = defaultdict(lambda: {
            'patient_ids': set(),
            'amount': Decimal('0.00'),
        })

        for payment in queryset.values('patient_id', 'department', 'service', 'amount'):
            department_name = (str(payment.get('department') or '').strip() or str(payment.get('service') or '').strip() or 'نامشخص')
            department_buckets[department_name]['patient_ids'].add(payment['patient_id'])
            department_buckets[department_name]['amount'] += payment['amount'] or Decimal('0.00')

        department_rows = [
            {
                'department': department_name,
                'patient_count': len(bucket['patient_ids']),
                'amount': str(bucket['amount']),
            }
            for department_name, bucket in sorted(department_buckets.items(), key=lambda item: item[0])
        ]
        total_amount = queryset.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        return Response({
            'from': from_date.isoformat(),
            'to': to_date.isoformat(),
            'patient_count': patient_count,
            'departments': department_rows,
            'total_amount': str(total_amount),
            'generated_at': timezone.localtime(timezone.now()).isoformat(),
        })

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'count': queryset.count(),
            'next': None,
            'previous': None,
            'results': serializer.data,
        })

    def _guard_external_department_edit(self, payment: Payment):
        if (payment.department or '').strip().lower() in {'laboratory', 'pharmacy'}:
            self.permission_denied(
                self.request,
                message='Laboratory and pharmacy payment records cannot be edited or deleted from reception.',
            )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        self._guard_external_department_edit(self.get_object())
        serializer.save()

    def perform_destroy(self, instance):
        self._guard_external_department_edit(instance)
        soft_delete_instance(instance, self.request.user)

    @action(detail=False, methods=['post'], url_path='reception-bill')
    def reception_bill(self, request):
        patient_data = request.data.get('patient') or {}
        payment_data = request.data.get('payment') or {}
        department = str(payment_data.get('department') or '').strip()
        doctor_username = str(payment_data.get('doctor_name') or '').strip()

        if department.lower() in RECEPTION_DOCTOR_DEPARTMENTS:
            has_valid_assignment = bool(doctor_username) and DoctorDepartmentAssignment.objects.filter(
                department__iexact=department,
                doctor__username=doctor_username,
                doctor__is_active=True,
                doctor__staff_profile__deleted_at__isnull=True,
                doctor__staff_profile__role__in=ASSIGNABLE_CLINICAL_ROLES,
            ).exists()
            if not has_valid_assignment:
                raise serializers.ValidationError({
                    'payment': {'doctor_name': 'Select a current doctor assigned to this department.'},
                })

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


class ExpenseCategoryViewSet(PermissionedModelViewSet):
    queryset = ExpenseCategory.objects.prefetch_related('subcategories')
    serializer_class = ExpenseCategorySerializer
    permission_map = {'*': 'expenses.manage'}
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('q', '').strip()
        if search:
            queryset = queryset.filter(
                Q(title_dari__icontains=search)
                | Q(title_pashto__icontains=search)
                | Q(title_english__icontains=search)
                | Q(subcategories__code__icontains=search)
                | Q(subcategories__title_dari__icontains=search)
                | Q(subcategories__title_pashto__icontains=search)
                | Q(subcategories__title_english__icontains=search)
            ).distinct()
        return queryset

    @action(detail=False, methods=['get'])
    def options(self, request):
        """Return the complete category tree for the expense entry picker."""
        return Response(self.get_serializer(self.get_queryset(), many=True).data)


class ExpenseViewSet(PermissionedModelViewSet):
    queryset = Expense.objects.select_related('created_by', 'vehicle_details')
    serializer_class = ExpenseSerializer
    permission_map = {'*': 'expenses.manage'}

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('q', '').strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(category__icontains=search)
                | Q(description__icontains=search)
                | Q(voucher_number__icontains=search)
                | Q(funding_source__icontains=search)
                | Q(project_activity__icontains=search)
                | Q(department__icontains=search)
                | Q(paid_to_received_from__icontains=search)
                | Q(vehicle_details__number_plate__icontains=search)
                | Q(vehicle_details__driver_name__icontains=search)
                | Q(vehicle_details__source__icontains=search)
                | Q(vehicle_details__destination__icontains=search)
                | Q(vehicle_details__travel_purpose__icontains=search)
                | Q(vehicle_details__fuel_station_supplier__icontains=search)
                | Q(vehicle_details__invoice_number__icontains=search)
                | Q(vehicle_details__workshop__icontains=search)
            )
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def _guard_salary_linked_expense(self, expense: Expense):
        if expense.salary_payment_id or expense.salary_advance_id:
            self.permission_denied(self.request, message='Salary-generated expenses must be edited or deleted from the Salaries section.')

    def perform_update(self, serializer):
        self._guard_salary_linked_expense(self.get_object())
        serializer.save()

    def perform_destroy(self, instance):
        self._guard_salary_linked_expense(instance)
        soft_delete_instance(instance, self.request.user)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        _date_from, _date_to, start_at, end_at = parse_expense_date_range(request)

        queryset = self.get_queryset()
        if start_at is not None:
            queryset = queryset.filter(created_at__gte=start_at)
        if end_at is not None:
            queryset = queryset.filter(created_at__lt=end_at)
        totals = {
            row['category']: row['total']
            for row in queryset.values('category').annotate(total=Sum('amount'))
        }
        subcategories = list(ExpenseSubcategory.objects.select_related('category').all())
        known_codes = {subcategory.code for subcategory in subcategories}
        results = [
            {
                'category': subcategory.code,
                'title': f'{subcategory.category.display_title} — {subcategory.display_title}',
                'amount': str(totals.pop(subcategory.code, Decimal('0.00')) or Decimal('0.00')),
            }
            for subcategory in subcategories
        ]
        results.extend(
            {
                'category': code,
                'title': code,
                'amount': str(amount or Decimal('0.00')),
            }
            for code, amount in totals.items()
            if code not in known_codes
        )
        return Response({
            'results': results,
        })

    @action(detail=False, methods=['get'])
    def report(self, request):
        """Detailed, date-filtered expense report for printing.

        Expense figures remain AFN. Cash and bank withdrawals are reported
        separately by currency so they are never mixed into expense totals.
        """
        date_from, date_to, start_at, end_at = parse_expense_date_range(request)
        report_page_size = 16
        try:
            expense_page_number = max(1, int(request.query_params.get('page', '1')))
        except (TypeError, ValueError):
            expense_page_number = 1
        try:
            withdrawal_page_number = max(1, int(request.query_params.get('withdrawal_page', '1')))
        except (TypeError, ValueError):
            withdrawal_page_number = 1
        category_records = list(ExpenseCategory.objects.prefetch_related('subcategories').all())

        def titles(item):
            return {
                'dari': item.title_dari or item.title_english or item.title_pashto or '',
                'pashto': item.title_pashto or item.title_dari or item.title_english or '',
                'english': item.title_english or item.title_dari or item.title_pashto or '',
            }

        category_groups = []
        category_by_code = {}
        for category in category_records:
            group = {
                'id': category.id,
                'titles': titles(category),
                'subcategories': [],
                'total': Decimal('0.00'),
            }
            category_groups.append(group)
            for subcategory in category.subcategories.all():
                subcategory_group = {
                    'code': subcategory.code,
                    'titles': titles(subcategory),
                    'entries': [],
                    'total': Decimal('0.00'),
                }
                group['subcategories'].append(subcategory_group)
                category_by_code[subcategory.code] = (group, subcategory_group)

        expenses = Expense.objects.order_by('created_at', 'id')
        if start_at is not None:
            expenses = expenses.filter(created_at__gte=start_at)
        if end_at is not None:
            expenses = expenses.filter(created_at__lt=end_at)

        expense_count = expenses.count()
        expense_page_count = max(1, (expense_count + report_page_size - 1) // report_page_size)
        if expense_page_number > expense_page_count:
            expense_page_number = expense_page_count
        expense_start = (expense_page_number - 1) * report_page_size
        totals_by_code = {
            row['category']: row['total'] or Decimal('0.00')
            for row in expenses.values('category').annotate(total=Sum('amount'))
        }
        total_expenses = expenses.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        for group in category_groups:
            for subcategory in group['subcategories']:
                subcategory['total'] = totals_by_code.pop(subcategory['code'], Decimal('0.00'))
                group['total'] += subcategory['total']

        other_group = {
            'id': None,
            'titles': {'dari': 'سایر مصارف', 'pashto': 'نور لګښتونه', 'english': 'Other expenses'},
            'subcategories': [],
            'total': Decimal('0.00'),
        }
        for code, total in totals_by_code.items():
            subcategory_group = {
                'code': code,
                'titles': {'dari': code, 'pashto': code, 'english': code},
                'entries': [],
                'total': total,
            }
            other_group['subcategories'].append(subcategory_group)
            other_group['total'] += total
            category_by_code[code] = (other_group, subcategory_group)

        salary_entries = []
        for row in expenses[expense_start:expense_start + report_page_size].values(
            'id', 'voucher_number', 'created_at', 'name', 'category', 'amount', 'description',
            'payment_method', 'funding_source', 'department', 'salary_payment_id', 'salary_advance_id',
        ):
            group_and_subcategory = category_by_code.get(row['category'])
            if group_and_subcategory is None:
                continue
            group, subcategory = group_and_subcategory

            amount = row['amount'] or Decimal('0.00')
            is_salary = bool(row['salary_payment_id'] or row['salary_advance_id'])
            entry = {
                'id': row['id'],
                'voucher_number': row['voucher_number'],
                'created_at': timezone.localtime(row['created_at']).isoformat(),
                'name': row['name'],
                'amount': str(amount),
                'description': row['description'],
                'payment_method': row['payment_method'],
                'funding_source': row['funding_source'],
                'department': row['department'],
                'is_salary': is_salary,
                'salary_type': 'settlement' if row['salary_payment_id'] else ('advance' if row['salary_advance_id'] else ''),
            }
            subcategory['entries'].append(entry)
            if is_salary:
                salary_entries.append(entry)

        report_categories = category_groups + ([other_group] if other_group['subcategories'] else [])
        withdrawals = CashBankTransaction.objects.filter(transaction_type=CashBankTransaction.TransactionType.WITHDRAWAL).order_by('created_at', 'id')
        if start_at is not None:
            withdrawals = withdrawals.filter(created_at__gte=start_at)
        if end_at is not None:
            withdrawals = withdrawals.filter(created_at__lt=end_at)
        withdrawal_count = withdrawals.count()
        withdrawal_page_count = max(1, (withdrawal_count + report_page_size - 1) // report_page_size)
        if withdrawal_page_number > withdrawal_page_count:
            withdrawal_page_number = withdrawal_page_count
        withdrawal_start = (withdrawal_page_number - 1) * report_page_size
        withdrawal_groups = {currency: {'currency': currency, 'entries': [], 'total': Decimal('0.00')} for currency in CashBankTransaction.Currency.values}
        withdrawal_totals = {
            row['currency']: row['total'] or Decimal('0.00')
            for row in withdrawals.values('currency').annotate(total=Sum('amount'))
        }
        for currency, group in withdrawal_groups.items():
            group['total'] = withdrawal_totals.get(currency, Decimal('0.00'))
        # The report's total is expressed in AFN, so include AFN withdrawals
        # only. USD remains visible as its own currency total and is never
        # converted using an assumed exchange rate.
        total_expenses += withdrawal_totals.get(CashBankTransaction.Currency.AFN, Decimal('0.00'))
        for row in withdrawals[withdrawal_start:withdrawal_start + report_page_size].values('id', 'created_at', 'amount', 'currency', 'reason', 'withdrawer_name'):
            group = withdrawal_groups[row['currency']]
            amount = row['amount'] or Decimal('0.00')
            group['entries'].append({
                'id': row['id'],
                'created_at': timezone.localtime(row['created_at']).isoformat(),
                'amount': str(amount),
                'reason': row['reason'],
                'withdrawer_name': row['withdrawer_name'],
            })

        def serialize_category(group):
            return {
                **group,
                'total': str(group['total']),
                'subcategories': [
                    {**subcategory, 'total': str(subcategory['total'])}
                    for subcategory in group['subcategories']
                ],
            }

        return Response({
            'from': date_from.isoformat() if date_from else '',
            'to': date_to.isoformat() if date_to else '',
            'generated_at': timezone.localtime(timezone.now()).isoformat(),
            'categories': [serialize_category(group) for group in report_categories],
            'total_expenses_afn': str(total_expenses),
            'salary_entries': salary_entries,
            'salary_total_afn': str(expenses.filter(Q(salary_payment__isnull=False) | Q(salary_advance__isnull=False)).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')),
            'pagination': {
                'page': expense_page_number,
                'page_size': report_page_size,
                'total_count': expense_count,
                'total_pages': expense_page_count,
            },
            'withdrawal_pagination': {
                'page': withdrawal_page_number,
                'page_size': report_page_size,
                'total_count': withdrawal_count,
                'total_pages': withdrawal_page_count,
            },
            'withdrawals': [
                {**group, 'total': str(group['total'])}
                for group in withdrawal_groups.values()
            ],
        })

    @action(detail=False, methods=['get'], url_path='export-xlsx')
    def export_xlsx(self, request):
        date_from, date_to, start_at, end_at = parse_expense_date_range(request)
        expenses = Expense.objects.order_by('created_at', 'id')
        if start_at is not None:
            expenses = expenses.filter(created_at__gte=start_at)
        if end_at is not None:
            expenses = expenses.filter(created_at__lt=end_at)
        subcategory_labels = {
            subcategory.code: f'{subcategory.category.display_title} — {subcategory.display_title}'
            for subcategory in ExpenseSubcategory.objects.select_related('category').all()
        }
        payment_method_labels = dict(Expense.PaymentMethod.choices)
        cheque_status_labels = dict(Expense.ChequeStatus.choices)

        def expense_rows():
            yield [
                'Voucher number', 'Date and time', 'Expense', 'Category', 'Payment method',
                'Bank name', 'Bank account', 'Transfer reference no.', 'Transfer date',
                'Cheque number', 'Cheque date', 'Cheque status', 'Paid to / received from',
                'Funding source', 'Project/activity', 'Department', 'Description',
                'Number plate', 'Driver name', 'Source', 'Destination', 'Travel purpose',
                'Vehicle expense type', 'Fuel type', 'Quantity (liters)',
                'Price per liter', 'Vehicle odometer (KM)', 'Fuel station / supplier',
                'Invoice number', 'Workshop', 'Amount (AFN)', 'Recorded by',
            ]
            total = Decimal('0.00')
            last_created_at = None
            last_id = None
            while True:
                page = expenses
                if last_created_at is not None and last_id is not None:
                    page = page.filter(
                        Q(created_at__gt=last_created_at)
                        | Q(created_at=last_created_at, id__gt=last_id)
                    )
                # Keyset pagination keeps each MySQL result set bounded. Some MySQL
                # drivers buffer a full query result even when QuerySet.iterator() is used.
                batch = list(page.values_list(
                    'id',
                    'voucher_number',
                    'created_at',
                    'name',
                    'category',
                    'payment_method',
                    'bank_name',
                    'bank_account',
                    'transfer_reference_number',
                    'transfer_date',
                    'cheque_number',
                    'cheque_date',
                    'cheque_status',
                    'paid_to_received_from',
                    'funding_source',
                    'project_activity',
                    'department',
                    'description',
                    'vehicle_details__number_plate',
                    'vehicle_details__driver_name',
                    'vehicle_details__source',
                    'vehicle_details__destination',
                    'vehicle_details__travel_purpose',
                    'vehicle_details__expense_type',
                    'vehicle_details__fuel_type',
                    'vehicle_details__quantity_liters',
                    'vehicle_details__price_per_liter',
                    'vehicle_details__vehicle_odometer_km',
                    'vehicle_details__fuel_station_supplier',
                    'vehicle_details__invoice_number',
                    'vehicle_details__workshop',
                    'amount',
                    'created_by__first_name',
                    'created_by__last_name',
                    'created_by__username',
                )[:1000])
                if not batch:
                    break
                for (
                    expense_id, voucher_number, created_at, name, category, payment_method,
                    bank_name, bank_account, transfer_reference_number, transfer_date,
                    cheque_number, cheque_date, cheque_status, paid_to_received_from,
                    funding_source, project_activity, department, description, number_plate, driver_name,
                    source, destination, travel_purpose,
                    vehicle_expense_type, fuel_type, quantity_liters, price_per_liter,
                    vehicle_odometer_km, fuel_station_supplier, invoice_number, workshop, amount,
                    first_name, last_name, username,
                ) in batch:
                    total += amount
                    recorded_by = ' '.join(part for part in (first_name, last_name) if part).strip() or username
                    yield [
                        voucher_number,
                        timezone.localtime(created_at).strftime('%Y-%m-%d %H:%M:%S'),
                        name or subcategory_labels.get(category, category),
                        subcategory_labels.get(category, category),
                        payment_method_labels.get(payment_method, payment_method),
                        bank_name,
                        bank_account,
                        transfer_reference_number,
                        transfer_date.isoformat() if transfer_date else '',
                        cheque_number,
                        cheque_date.isoformat() if cheque_date else '',
                        cheque_status_labels.get(cheque_status, cheque_status),
                        paid_to_received_from,
                        funding_source,
                        project_activity,
                        department,
                        description,
                        number_plate or '',
                        driver_name or '',
                        source or '',
                        destination or '',
                        travel_purpose or '',
                        {'fuel': 'Fuel', 'maintenance': 'Vehicle maintenance'}.get(vehicle_expense_type, vehicle_expense_type or ''),
                        {'diesel': 'Diesel', 'petrol': 'Petrol', 'gas': 'Gas'}.get(fuel_type, fuel_type or ''),
                        quantity_liters if quantity_liters is not None else '',
                        price_per_liter if price_per_liter is not None else '',
                        vehicle_odometer_km if vehicle_odometer_km is not None else '',
                        fuel_station_supplier or '',
                        invoice_number or '',
                        workshop or '',
                        amount,
                        recorded_by,
                    ]
                    last_created_at = created_at
                    last_id = expense_id
            yield ['Grand total'] + [''] * 29 + [total, '']

        temporary_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
        temporary_path = temporary_file.name
        temporary_file.close()
        try:
            write_xlsx_workbook(temporary_path, 'Expenses', expense_rows())
        except Exception:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass
            raise

        range_suffix = (
            f'{date_from.isoformat() if date_from else "earliest"}-to-'
            f'{date_to.isoformat() if date_to else "latest"}'
        )
        response = FileResponse(
            DeleteAfterClose(temporary_path),
            as_attachment=True,
            filename=f'expenses-{range_suffix}.xlsx',
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Cache-Control'] = 'no-store'
        return response

    @action(detail=False, methods=['get'])
    def categories(self, request):
        search = request.query_params.get('q', '').strip().lower()
        try:
            offset = max(0, int(request.query_params.get('offset', '0')))
        except ValueError:
            offset = 0

        categories = ExpenseSubcategory.objects.select_related('category').order_by('category__title_english', 'category__title_dari', 'category__title_pashto', 'code')
        if search:
            categories = categories.filter(
                Q(code__icontains=search)
                | Q(title_dari__icontains=search)
                | Q(title_pashto__icontains=search)
                | Q(title_english__icontains=search)
                | Q(category__title_dari__icontains=search)
                | Q(category__title_pashto__icontains=search)
                | Q(category__title_english__icontains=search)
            )

        limit = 5
        total = categories.count()
        results = [
            {
                'id': category.id,
                'name': category.display_title,
                'code': category.code,
                'category_title': category.category.display_title,
            }
            for category in categories[offset:offset + limit]
        ]
        next_offset = offset + limit if offset + limit < total else None
        return Response({'results': results, 'next_offset': next_offset})


class AuditLogViewSet(PermissionedModelViewSet):
    queryset = AuditLog.objects.select_related('actor')
    serializer_class = AuditLogSerializer
    pagination_class = StandardResultsSetPagination
    permission_map = {'*': 'expenses.manage'}
    http_method_names = ['get', 'head', 'options']

    def check_permissions(self, request):
        super().check_permissions(request)
        profile = getattr(request.user, 'staff_profile', None)
        if profile is None or profile.role not in {Role.RECEPTIONIST, Role.SUPER_ADMIN}:
            self.permission_denied(request, message='Audit log is available to Reception and Super Admin only.')

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('q', '').strip()
        action = self.request.query_params.get('action', '').strip().lower()
        if search:
            queryset = queryset.filter(
                Q(resource__icontains=search)
                | Q(target_id__icontains=search)
                | Q(endpoint__icontains=search)
                | Q(actor__username__icontains=search)
                | Q(actor__first_name__icontains=search)
                | Q(actor__last_name__icontains=search)
                | Q(ip_address__icontains=search)
            )
        if action in AuditLog.Action.values:
            queryset = queryset.filter(action=action)
        return queryset


class CashBankTransactionViewSet(PermissionedModelViewSet):
    """Append-only cash and bank ledger for reception and super-admin users."""

    queryset = CashBankTransaction.objects.select_related('created_by')
    serializer_class = CashBankTransactionSerializer
    pagination_class = StandardResultsSetPagination
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    permission_map = {'*': 'expenses.manage'}
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    def check_permissions(self, request):
        super().check_permissions(request)
        profile = getattr(request.user, 'staff_profile', None)
        if profile is None or profile.role not in {Role.RECEPTIONIST, Role.SUPER_ADMIN}:
            self.permission_denied(request, message='Cash and bank accounts are available to Reception and Super Admin only.')

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('q', '').strip()
        currency = self.request.query_params.get('currency', '').strip().upper()
        if search:
            queryset = queryset.filter(
                Q(reason__icontains=search)
                | Q(depositor_name__icontains=search)
                | Q(withdrawer_name__icontains=search)
                | Q(created_by__first_name__icontains=search)
                | Q(created_by__last_name__icontains=search)
                | Q(created_by__username__icontains=search)
            )
        if currency in CashBankTransaction.Currency.values:
            queryset = queryset.filter(currency=currency)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        soft_delete_instance(instance, self.request.user)

    @action(detail=False, methods=['get'])
    def balances(self, request):
        totals = defaultdict(lambda: {'deposit': Decimal('0.00'), 'withdrawal': Decimal('0.00')})
        for row in self.get_queryset().values('currency', 'transaction_type').annotate(total=Sum('amount')):
            totals[row['currency']][row['transaction_type']] = row['total'] or Decimal('0.00')
        return Response({
            'balances': [
                {
                    'currency': currency,
                    'balance': str(totals[currency]['deposit'] - totals[currency]['withdrawal']),
                }
                for currency in CashBankTransaction.Currency.values
            ],
        })


def build_salary_expense_description(salary_payment: SalaryPayment) -> str:
    months = ', '.join(salary_payment.months or [])
    employee_name = f'{salary_payment.employee.first_name} {salary_payment.employee.last_name}'.strip()
    return (
        f'Salary payment for {employee_name}. '
        f'Afghan year: {salary_payment.afghan_year}. '
        f'Months: {months}. '
        f'Gross: {salary_payment.gross_salary} AFN. '
        f'Absence deduction: {salary_payment.absence_deduction} AFN. '
        f'Tax: {salary_payment.tax_amount} AFN. '
        f'Advance deduction: {salary_payment.advance_payment} AFN. '
        f'Advance balance carried: {salary_payment.advance_balance_carried} AFN.'
    )


def sync_salary_payment_expense(salary_payment: SalaryPayment):
    employee_name = f'{salary_payment.employee.first_name} {salary_payment.employee.last_name}'.strip()
    expense_defaults = {
        'name': f'Salary payment - {employee_name}',
        'category': 'E-05',
        'amount': salary_payment.payable_amount,
        'description': build_salary_expense_description(salary_payment),
        'created_by': salary_payment.created_by,
    }
    Expense.objects.update_or_create(
        salary_payment=salary_payment,
        defaults=expense_defaults,
    )


def build_salary_advance_expense_description(salary_advance: SalaryAdvance) -> str:
    employee_name = f'{salary_advance.employee.first_name} {salary_advance.employee.last_name}'.strip()
    return (
        f'Salary advance paid to {employee_name}. '
        f'Afghan year: {salary_advance.afghan_year}. '
        f'Afghan month: {salary_advance.afghan_month}.'
    )


def sync_salary_advance_expense(salary_advance: SalaryAdvance):
    employee_name = f'{salary_advance.employee.first_name} {salary_advance.employee.last_name}'.strip()
    expense_defaults = {
        'name': f'Salary advance - {employee_name}',
        'category': 'E-05',
        'amount': salary_advance.amount,
        'description': build_salary_advance_expense_description(salary_advance),
        'created_by': salary_advance.created_by,
    }
    Expense.objects.update_or_create(
        salary_advance=salary_advance,
        defaults=expense_defaults,
    )


def list_employee_advances_for_salary(employee, *, exclude_salary_payment_id: int | None = None):
    advances = (
        SalaryAdvance.objects.filter(employee=employee)
        .prefetch_related('settlements')
        .order_by('created_at', 'id')
    )
    available_entries: list[tuple[SalaryAdvance, Decimal]] = []
    total = Decimal('0')
    for advance in advances:
        settled = Decimal('0')
        for settlement in advance.settlements.all():
            if exclude_salary_payment_id is not None and settlement.salary_payment_id == exclude_salary_payment_id:
                continue
            settled += settlement.amount
        outstanding = money(max(Decimal('0'), advance.amount - settled))
        if outstanding > 0:
            available_entries.append((advance, outstanding))
            total += outstanding
    return available_entries, money(total)


def sync_salary_advance_settlements(salary_payment: SalaryPayment):
    SalaryAdvanceSettlement.objects.filter(salary_payment=salary_payment).delete()
    remaining = money(salary_payment.advance_payment or Decimal('0'))
    if remaining <= 0:
        return
    advances, _total = list_employee_advances_for_salary(
        salary_payment.employee,
        exclude_salary_payment_id=salary_payment.id,
    )
    for advance, outstanding in advances:
        if remaining <= 0:
            break
        applied = money(min(remaining, outstanding))
        if applied <= 0:
            continue
        SalaryAdvanceSettlement.objects.create(
            salary_advance=advance,
            salary_payment=salary_payment,
            amount=applied,
        )
        remaining = money(remaining - applied)


class SalaryAdvanceViewSet(PermissionedModelViewSet):
    queryset = SalaryAdvance.objects.select_related('employee', 'created_by').all()
    serializer_class = SalaryAdvanceSerializer
    permission_map = {'*': 'expenses.manage'}

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('q', '').strip()
        if search:
            conditions = (
                Q(employee__first_name__icontains=search)
                | Q(employee__last_name__icontains=search)
                | Q(employee__position__icontains=search)
                | Q(notes__icontains=search)
                | Q(afghan_month__icontains=search)
            )
            if search.isdigit():
                conditions |= Q(afghan_year=int(search))
            queryset = queryset.filter(conditions)
        return queryset

    def perform_create(self, serializer):
        with transaction.atomic():
            afghan_year, _month_index, month_name, _day = current_afghan_date()
            salary_advance = serializer.save(
                created_by=self.request.user,
                afghan_year=afghan_year,
                afghan_month=month_name,
            )
            sync_salary_advance_expense(salary_advance)

    def perform_update(self, serializer):
        salary_advance = self.get_object()
        if salary_advance.settlements.exists():
            self.permission_denied(self.request, message='This salary advance has already been used in salary settlement and cannot be edited.')
        with transaction.atomic():
            updated = serializer.save()
            sync_salary_advance_expense(updated)

    def perform_destroy(self, instance):
        if instance.settlements.exists():
            self.permission_denied(self.request, message='This salary advance has already been used in salary settlement and cannot be deleted.')
        with transaction.atomic():
            soft_delete_instance(instance, self.request.user)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        employee_id = request.query_params.get('employee')
        exclude_salary_payment = request.query_params.get('exclude_salary_payment')
        if not employee_id:
            return Response({'total_outstanding': '0.00', 'count': 0, 'advances': []})
        try:
            employee_id_int = int(employee_id)
        except ValueError:
            return Response({'detail': 'Invalid employee id.'}, status=status.HTTP_400_BAD_REQUEST)
        exclude_salary_payment_id = None
        if exclude_salary_payment:
            try:
                exclude_salary_payment_id = int(exclude_salary_payment)
            except ValueError:
                exclude_salary_payment_id = None
        try:
            employee = Employee.objects.get(pk=employee_id_int)
        except Exception:
            return Response({'detail': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)
        advances, total = list_employee_advances_for_salary(employee, exclude_salary_payment_id=exclude_salary_payment_id)
        return Response(
            {
                'total_outstanding': str(total),
                'count': len(advances),
                'advances': [
                    {
                        'id': advance.id,
                        'amount': str(advance.amount),
                        'outstanding_amount': str(outstanding),
                        'afghan_year': advance.afghan_year,
                        'afghan_month': advance.afghan_month,
                        'created_at': advance.created_at,
                    }
                    for advance, outstanding in advances
                ],
            }
        )


class SalaryPaymentViewSet(PermissionedModelViewSet):
    queryset = SalaryPayment.objects.select_related('employee', 'created_by').all()
    serializer_class = SalaryPaymentSerializer
    permission_map = {'*': 'expenses.manage'}

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('q', '').strip()
        if search:
            conditions = (
                Q(employee__first_name__icontains=search)
                | Q(employee__last_name__icontains=search)
                | Q(employee__position__icontains=search)
                | Q(notes__icontains=search)
                | Q(months__icontains=search)
            )
            if search.isdigit():
                conditions |= Q(afghan_year=int(search))
            queryset = queryset.filter(conditions)
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        employee_id = self.request.data.get('employee')
        instance = getattr(self, 'get_object', None)
        current_salary_payment_id = None
        if self.action in {'update', 'partial_update'}:
            try:
                current_salary_payment_id = self.get_object().id
            except Exception:
                current_salary_payment_id = None
        if employee_id:
            try:
                employee = Employee.objects.get(pk=int(employee_id))
                _advances, total = list_employee_advances_for_salary(
                    employee,
                    exclude_salary_payment_id=current_salary_payment_id,
                )
                context['available_advance_total'] = total
            except Exception:
                context['available_advance_total'] = Decimal('0')
        return context

    def perform_create(self, serializer):
        with transaction.atomic():
            salary_payment = serializer.save(created_by=self.request.user)
            sync_salary_advance_settlements(salary_payment)
            sync_salary_payment_expense(salary_payment)

    def perform_update(self, serializer):
        with transaction.atomic():
            salary_payment = serializer.save()
            sync_salary_advance_settlements(salary_payment)
            sync_salary_payment_expense(salary_payment)

    def perform_destroy(self, instance):
        with transaction.atomic():
            soft_delete_instance(instance, self.request.user)

    @action(detail=False, methods=['get'])
    def months(self, request):
        return Response({'results': [{'id': index + 1, 'name': month} for index, month in enumerate(AFGHAN_MONTHS)]})

    @action(detail=False, methods=['get'])
    def meta(self, request):
        afghan_year, month_index, month_name, day = current_afghan_date()
        return Response(
            {
                'current_afghan_year': afghan_year,
                'current_afghan_month_index': month_index,
                'current_afghan_month': month_name,
                'current_afghan_day': day,
            }
        )


class ClinicalDocumentViewSet(PermissionedModelViewSet):
    queryset = ClinicalDocument.objects.select_related('patient', 'created_by')
    serializer_class = ClinicalDocumentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        document_type = self.request.query_params.get('document_type')
        mine_only = self.request.query_params.get('mine')
        midwife_record = self.request.query_params.get('midwife_record')
        delivery_record = self.request.query_params.get('delivery_record')
        malnutrition_record = self.request.query_params.get('malnutrition_record')
        gynecology_ultrasound = self.request.query_params.get('gynecology_ultrasound')
        doctor_documents = self.request.query_params.get('doctor_documents')
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
        if delivery_record in {'1', 'true', 'yes'}:
            queryset = queryset.filter(
                document_type=ClinicalDocument.DocumentType.ULTRASOUND,
                payload__delivery_record=True,
            )
        if malnutrition_record in {'1', 'true', 'yes'}:
            queryset = queryset.filter(
                document_type=ClinicalDocument.DocumentType.RUTF,
                payload__malnutrition_record=True,
            )
        if gynecology_ultrasound in {'1', 'true', 'yes'}:
            queryset = queryset.filter(
                document_type=ClinicalDocument.DocumentType.ULTRASOUND,
                payload__gynecology_ultrasound=True,
            )
        if doctor_documents in {'1', 'true', 'yes'}:
            queryset = queryset.filter(
                document_type__in=[
                    ClinicalDocument.DocumentType.PRESCRIPTION,
                    ClinicalDocument.DocumentType.LAB_ORDER,
                ]
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

    def perform_destroy(self, instance):
        soft_delete_instance(instance, self.request.user)

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
        gender = self.request.query_params.get('gender', '').strip().lower()
        family_planning_only = self.request.query_params.get('family_planning_only')
        if self.action in {'list', 'retrieve', 'search'}:
            queryset = queryset.filter(is_active=True)
        if gender in {'female', 'male', 'other'}:
            queryset = queryset.filter(gender=gender)
        if family_planning_only in {'1', 'true', 'yes'}:
            queryset = queryset.none()
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
        family_planning_only = request.query_params.get('family_planning_only')
        if family_planning_only in {'1', 'true', 'yes'}:
            pharmacy_queryset = pharmacy_queryset.filter(generic_name__iexact='Family Planning')
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

    def perform_destroy(self, instance):
        soft_delete_instance(instance, self.request.user)


class LabTestViewSet(PermissionedModelViewSet):
    queryset = LabTest.objects.select_related('parent_panel').all()
    serializer_class = LabTestSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action in {'list', 'retrieve', 'search'}:
            queryset = queryset.filter(is_active=True)
        search = self.request.query_params.get('q', '').strip()
        if search and self.action == 'list':
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(display_name__icontains=search)
                | Q(category__icontains=search)
                | Q(normal_range_from__icontains=search)
                | Q(normal_range_to__icontains=search)
                | Q(unit__icontains=search)
            )
        return queryset

    @action(detail=False, methods=['get'])
    def search(self, request):
        queryset = (
            self.get_queryset()
            .annotate(component_count=Count('components', filter=Q(components__is_active=True)))
            .order_by('category', 'sort_order', 'name')
        )
        search = request.query_params.get('q', '').strip()
        try:
            offset = max(0, int(request.query_params.get('offset', '0')))
        except ValueError:
            offset = 0

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(display_name__icontains=search)
                | Q(category__icontains=search)
                | Q(unit__icontains=search)
            )

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
        if period not in {'daily', 'weekly', 'monthly', 'annual', 'custom'}:
            period = 'daily'
        start_at, end_at, period_label = resolve_dashboard_period(
            period,
            request.query_params.get('from', '').strip(),
            request.query_params.get('to', '').strip(),
        )
        profile = getattr(request.user, 'staff_profile', None)
        role = getattr(profile, 'role', None)

        if role in {Role.DOCTOR, Role.GYNECOLOGIST}:
            doctor_documents = ClinicalDocument.objects.filter(
                created_by=request.user,
                created_at__gte=start_at,
            )
            if end_at is not None:
                doctor_documents = doctor_documents.filter(created_at__lt=end_at)
            doctor_documents = doctor_documents.filter(
                Q(document_type__in={
                    ClinicalDocument.DocumentType.PRESCRIPTION,
                    ClinicalDocument.DocumentType.LAB_ORDER,
                }) | Q(
                    document_type=ClinicalDocument.DocumentType.ULTRASOUND,
                    payload__gynecology_ultrasound=True,
                )
            )
            patient_ids = list(doctor_documents.values_list('patient_id', flat=True).distinct())
            doctor_payments = Payment.objects.filter(
                patient_id__in=patient_ids,
                created_at__gte=start_at,
            )
            if end_at is not None:
                doctor_payments = doctor_payments.filter(created_at__lt=end_at)
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
                    'expenses_count': 0,
                    'expenses_amount': '0',
                }
            )

        patients = Patient.objects.filter(created_at__gte=start_at)
        payments = Payment.objects.filter(created_at__gte=start_at)
        expenses = Expense.objects.filter(created_at__gte=start_at)
        if end_at is not None:
            patients = patients.filter(created_at__lt=end_at)
            payments = payments.filter(created_at__lt=end_at)
            expenses = expenses.filter(created_at__lt=end_at)
        patient_trend = build_patient_trend(period, patients)

        pending_payments = payments.filter(status=Payment.Status.PENDING).count()
        approved_payments = payments.filter(status=Payment.Status.APPROVED).count()
        pending_amount = payments.filter(status=Payment.Status.PENDING).aggregate(total=Sum('amount'))['total'] or 0
        approved_amount = payments.filter(status=Payment.Status.APPROVED).aggregate(total=Sum('amount'))['total'] or 0
        expenses_amount = expenses.aggregate(total=Sum('amount'))['total'] or 0

        midwifery_service_labels = dict(Payment.MidwiferyService.choices)
        midwifery_services = [
            {
                'service': row['midwifery_service'],
                'service_label': midwifery_service_labels.get(row['midwifery_service'], row['midwifery_service'] or 'Not specified'),
                'patients': row['patients'],
                'payments': row['payments'],
                'amount': str(row['amount'] or 0),
            }
            for row in payments.filter(department__iexact='Midwifery').values('midwifery_service').annotate(
                patients=Count('patient', distinct=True),
                payments=Count('id'),
                amount=Sum('amount'),
            ).order_by('midwifery_service')
        ]

        departments = [
            {
                'department': row['department'] or 'Unassigned',
                'patients': row['patients'],
                'payments': row['payments'],
                'amount': str(row['amount'] or 0),
                'midwifery_services': midwifery_services if (row['department'] or '').strip().lower() == 'midwifery' else [],
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
                'expenses_count': expenses.count(),
                'expenses_amount': str(expenses_amount),
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


class WebsitePostViewSet(viewsets.ModelViewSet):
    queryset = WebsitePost.objects.select_related('created_by', 'updated_by').prefetch_related('images')
    serializer_class = WebsitePostSerializer
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    pagination_class = None

    def get_permissions(self):
        if self.action == 'public':
            return [AllowAny()]
        return [IsAuthenticated()]

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action != 'public' and not user_has_permission(request.user, 'website.content.manage'):
            self.permission_denied(request, message='Missing permission: website.content.manage')

    @action(detail=False, methods=['get'], url_path='public')
    def public(self, request):
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(self.get_queryset(), request, view=self)
        serializer = self.get_serializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def perform_create(self, serializer):
        photos = [compress_website_post_image(photo) for photo in self.request.FILES.getlist('images')]
        with transaction.atomic():
            post = serializer.save(created_by=self.request.user, updated_by=self.request.user)
            for photo in photos:
                WebsitePostImage.objects.create(post=post, image=photo)

    def perform_update(self, serializer):
        photos = [compress_website_post_image(photo) for photo in self.request.FILES.getlist('images')]
        with transaction.atomic():
            post = serializer.save(updated_by=self.request.user)
            for photo in photos:
                WebsitePostImage.objects.create(post=post, image=photo)

    @action(detail=True, methods=['delete'], url_path=r'images/(?P<image_id>[^/.]+)')
    def delete_image(self, request, pk=None, image_id=None):
        post = self.get_object()
        try:
            image = post.images.get(pk=image_id)
        except WebsitePostImage.DoesNotExist:
            raise serializers.ValidationError({'image': 'Photo not found.'})
        image.image.delete(save=False)
        image.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_destroy(self, instance):
        for image in instance.images.all():
            image.image.delete(save=False)
        instance.delete()


class WebsiteGalleryViewSet(viewsets.GenericViewSet, mixins.ListModelMixin, mixins.DestroyModelMixin):
    queryset = WebsiteGalleryImage.objects.select_related('uploaded_by')
    serializer_class = WebsiteGalleryImageSerializer
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    pagination_class = None

    def get_permissions(self):
        if self.action == 'public':
            return [AllowAny()]
        return [IsAuthenticated()]

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action != 'public' and not user_has_permission(request.user, 'website.content.manage'):
            self.permission_denied(request, message='Missing permission: website.content.manage')

    @action(detail=False, methods=['get'], url_path='public')
    def public(self, request):
        return Response(self.get_serializer(self.get_queryset(), many=True).data)

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request):
        photos = request.FILES.getlist('images')
        if not photos:
            raise serializers.ValidationError({'images': 'Select one or more photos.'})
        compressed_photos = [compress_website_post_image(photo) for photo in photos]
        with transaction.atomic():
            images = [WebsiteGalleryImage.objects.create(image=photo, uploaded_by=request.user) for photo in compressed_photos]
        return Response(self.get_serializer(images, many=True).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        instance.image.delete(save=False)
        instance.delete()


class PrivateDocumentViewSet(PermissionedModelViewSet):
    queryset = PrivateDocument.objects.select_related('uploaded_by')
    serializer_class = PrivateDocumentSerializer
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    permission_map = {'*': 'private_documents.manage'}

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('q', '').strip()
        category = self.request.query_params.get('category', '').strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(category__icontains=search)
                | Q(file__icontains=search)
            )
        if category:
            queryset = queryset.filter(category__iexact=category)
        return queryset

    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(uploaded_by=self.request.user)

    def perform_destroy(self, instance):
        soft_delete_instance(instance, self.request.user)

    @action(detail=False, methods=['get'])
    def categories(self, request):
        queryset = self.get_queryset()
        search = request.query_params.get('q', '').strip()
        categories = sorted({category for category in queryset.values_list('category', flat=True) if category})
        if search:
            categories = [category for category in categories if search.lower() in category.lower()]
        return Response({'results': [{'id': index + 1, 'name': category} for index, category in enumerate(categories)]})

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        document = self.get_object()
        response = FileResponse(document.file.open('rb'), as_attachment=True, filename=Path(document.file.name).name)
        return response
