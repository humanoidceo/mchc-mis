import json
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum
from rest_framework import serializers

from .models import ClinicalDocument, Expense, LabTest, Medicine, MedicineStockMovement, Patient, Payment, SalaryAdvance, SalaryAdvanceSettlement, SalaryPayment, WebsitePageContent, WebsiteSettings
from .salary_rules import AFGHAN_MONTHS, calculate_afghanistan_salary_tax, current_afghan_date


MONEY_QUANT = Decimal('0.01')
MAX_WEBSITE_IMAGE_SIZE = 8 * 1024 * 1024
ALLOWED_WEBSITE_IMAGE_EXTENSIONS = {'.avif', '.gif', '.heic', '.jpeg', '.jpg', '.png', '.webp'}
FREE_PAYMENT_DEPARTMENTS = {'vaccination', 'malnutrition'}


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def validate_website_image_file(file):
    content_type = getattr(file, 'content_type', '')
    extension = Path(file.name).suffix.lower()
    if content_type and not content_type.startswith('image/'):
        raise serializers.ValidationError('Upload an image file.')
    if extension not in ALLOWED_WEBSITE_IMAGE_EXTENSIONS:
        raise serializers.ValidationError('Supported image types: AVIF, GIF, HEIC, JPG, PNG, and WEBP.')
    if file.size > MAX_WEBSITE_IMAGE_SIZE:
        raise serializers.ValidationError('Image files must be 8 MB or smaller.')
    return file


def media_or_fallback_url(request, file, fallback: str) -> str:
    if file:
        url = file.url
        return request.build_absolute_uri(url) if request else url
    return fallback


def is_free_payment_department(department: str | None) -> bool:
    return (department or '').strip().lower() in FREE_PAYMENT_DEPARTMENTS


class PatientSerializer(serializers.ModelSerializer):
    registered_by_name = serializers.CharField(source='registered_by.get_full_name', read_only=True)

    class Meta:
        model = Patient
        fields = '__all__'
        read_only_fields = ('registration_number', 'registered_by', 'created_at', 'updated_at')


class PaymentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.__str__', read_only=True)
    patient_full_name = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)

    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ('created_by', 'approved_by', 'approved_at', 'created_at', 'updated_at')
        extra_kwargs = {
            'amount': {'required': False},
            'service': {'required': False, 'allow_blank': True},
        }

    def get_patient_full_name(self, obj) -> str:
        return f'{obj.patient.first_name} {obj.patient.last_name}'.strip()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        department = attrs.get('department', getattr(self.instance, 'department', ''))
        doctor_fee = attrs.get('doctor_fee', getattr(self.instance, 'doctor_fee', Decimal('0'))) or Decimal('0')
        payment_type = attrs.get('payment_type', getattr(self.instance, 'payment_type', Payment.PaymentType.FULL))
        discount_percentage = attrs.get('discount_percentage', getattr(self.instance, 'discount_percentage', Decimal('0'))) or Decimal('0')

        if is_free_payment_department(department):
            doctor_fee = Decimal('0')
            payment_type = Payment.PaymentType.FREE
            discount_percentage = Decimal('100')

        if doctor_fee < 0:
            raise serializers.ValidationError({'doctor_fee': 'Doctor fee cannot be negative.'})
        if discount_percentage < 0 or discount_percentage > 100:
            raise serializers.ValidationError({'discount_percentage': 'Discount must be between 0 and 100.'})

        doctor_fee = money(doctor_fee)
        if payment_type == Payment.PaymentType.FREE:
            discount_percentage = Decimal('100')
            discount_amount = doctor_fee
            amount = Decimal('0')
        elif payment_type == Payment.PaymentType.DISCOUNT:
            discount_amount = money(doctor_fee * discount_percentage / Decimal('100'))
            amount = money(doctor_fee - discount_amount)
        else:
            discount_percentage = Decimal('0')
            discount_amount = Decimal('0')
            amount = doctor_fee

        attrs['doctor_fee'] = doctor_fee
        attrs['discount_percentage'] = money(discount_percentage)
        attrs['discount_amount'] = money(discount_amount)
        attrs['amount'] = money(amount)
        if not attrs.get('service') and attrs.get('department'):
            attrs['service'] = f"{attrs['department']} consultation"
        return attrs


class ExpenseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = Expense
        fields = '__all__'
        read_only_fields = ('created_by', 'created_at', 'updated_at', 'salary_payment', 'salary_advance')

    def validate_amount(self, value):
        value = money(value)
        if value <= 0:
            raise serializers.ValidationError('Expense amount must be greater than zero.')
        return value


class SalaryPaymentSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_position = serializers.CharField(source='employee.position', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    month_count = serializers.SerializerMethodField()
    linked_expense_id = serializers.IntegerField(source='linked_expense.id', read_only=True)

    class Meta:
        model = SalaryPayment
        fields = '__all__'
        read_only_fields = (
            'created_by',
            'created_at',
            'updated_at',
            'afghan_year',
            'advance_payment',
            'monthly_salary',
            'gross_salary',
            'absence_deduction',
            'taxable_salary',
            'tax_amount',
            'net_salary',
            'payable_amount',
            'advance_balance_carried',
        )

    def get_employee_name(self, obj) -> str:
        return f'{obj.employee.first_name} {obj.employee.last_name}'.strip()

    def get_month_count(self, obj) -> int:
        return len(obj.months or [])

    def validate_months(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError('Select at least one Afghan salary month.')
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in value:
            month = str(item).strip()
            if month not in AFGHAN_MONTHS:
                raise serializers.ValidationError(f'Invalid Afghan month: {month}')
            if month in seen:
                raise serializers.ValidationError('Each month can only be selected once.')
            seen.add(month)
            cleaned.append(month)
        return cleaned

    def validate_absence_days(self, value):
        if value < 0:
            raise serializers.ValidationError('Absence days cannot be negative.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        employee = attrs.get('employee', getattr(self.instance, 'employee', None))
        months = attrs.get('months', getattr(self.instance, 'months', [])) or []
        absence_days = attrs.get('absence_days', getattr(self.instance, 'absence_days', 0)) or 0
        year = attrs.get('afghan_year', getattr(self.instance, 'afghan_year', None))

        if employee is None:
            raise serializers.ValidationError({'employee': 'Select an employee.'})

        month_count = len(months)
        if month_count <= 0:
            raise serializers.ValidationError({'months': 'Select at least one Afghan month.'})

        monthly_salary = money(employee.salary or Decimal('0'))
        if monthly_salary <= 0:
            raise serializers.ValidationError({'employee': 'This employee does not have a valid monthly salary.'})

        daily_salary = money(monthly_salary / Decimal('30'))
        gross_salary = money(monthly_salary * Decimal(str(month_count)))
        absence_deduction = money(daily_salary * Decimal(str(absence_days)))
        if absence_deduction > gross_salary:
            raise serializers.ValidationError({'absence_days': 'Absence deduction cannot be greater than the gross salary.'})

        taxable_salary = money(gross_salary - absence_deduction)
        average_monthly_taxable_salary = money(taxable_salary / Decimal(str(month_count)))
        tax_amount = money(calculate_afghanistan_salary_tax(average_monthly_taxable_salary) * Decimal(str(month_count)))
        net_salary = money(taxable_salary - tax_amount)
        current_year, _month_index, _month_name, _day = current_afghan_date()
        if year is None:
            year = current_year
        available_advance_total = self.context.get('available_advance_total')
        if available_advance_total is None:
            available_advance_total = Decimal('0')
        available_advance_total = money(Decimal(available_advance_total))
        advance_payment = money(min(net_salary, available_advance_total))
        payable_amount = money(net_salary - advance_payment)
        advance_balance_carried = money(max(Decimal('0'), available_advance_total - advance_payment))

        attrs['afghan_year'] = year
        attrs['monthly_salary'] = monthly_salary
        attrs['gross_salary'] = gross_salary
        attrs['absence_deduction'] = absence_deduction
        attrs['taxable_salary'] = taxable_salary
        attrs['tax_amount'] = tax_amount
        attrs['net_salary'] = net_salary
        attrs['advance_payment'] = advance_payment
        attrs['advance_balance_carried'] = advance_balance_carried
        attrs['payable_amount'] = payable_amount
        return attrs


class SalaryAdvanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_position = serializers.CharField(source='employee.position', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    settled_amount = serializers.SerializerMethodField()
    outstanding_amount = serializers.SerializerMethodField()
    linked_expense_id = serializers.IntegerField(source='linked_expense.id', read_only=True)

    class Meta:
        model = SalaryAdvance
        fields = '__all__'
        read_only_fields = (
            'created_by',
            'created_at',
            'updated_at',
            'afghan_year',
            'afghan_month',
        )

    def get_employee_name(self, obj) -> str:
        return f'{obj.employee.first_name} {obj.employee.last_name}'.strip()

    def get_settled_amount(self, obj) -> str:
        total = obj.settlements.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        return str(money(total))

    def get_outstanding_amount(self, obj) -> str:
        total = obj.settlements.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        outstanding = money(obj.amount - money(total))
        return str(max(Decimal('0'), outstanding))

    def validate_amount(self, value):
        value = money(value)
        if value <= 0:
            raise serializers.ValidationError('Salary advance amount must be greater than zero.')
        return value


class ClinicalDocumentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.__str__', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    document_type_label = serializers.CharField(source='get_document_type_display', read_only=True)

    class Meta:
        model = ClinicalDocument
        fields = '__all__'
        read_only_fields = ('created_by', 'payment', 'created_at', 'updated_at')

    def validate(self, attrs):
        attrs = super().validate(attrs)
        document_type = attrs.get('document_type', getattr(self.instance, 'document_type', None))
        payload = attrs.get('payload', getattr(self.instance, 'payload', {})) or {}
        patient = attrs.get('patient', getattr(self.instance, 'patient', None))

        if document_type == ClinicalDocument.DocumentType.ULTRASOUND and isinstance(payload, dict) and (payload.get('midwife_record') or payload.get('delivery_record')):
            if patient and not patient.payments.filter(department__iexact='Maternal care').exists():
                raise serializers.ValidationError({'patient': 'This patient is not registered in the Maternal care department.'})

        if document_type == ClinicalDocument.DocumentType.ULTRASOUND and isinstance(payload, dict) and payload.get('midwife_record'):
            visit_type = str(payload.get('visit_type', '')).strip().lower()
            if visit_type not in {'anc', 'pnc'}:
                raise serializers.ValidationError({'payload': 'Visit type must be ANC or PNC for midwife records.'})

            patient_status = str(payload.get('patient_status', '')).strip().lower()
            if patient_status not in {'new', 'follow_up'}:
                raise serializers.ValidationError({'payload': 'Patient status must be new or follow_up for midwife records.'})

        if document_type == ClinicalDocument.DocumentType.ULTRASOUND and isinstance(payload, dict) and payload.get('delivery_record'):
            delivery_mode = str(payload.get('delivery_mode', '')).strip().lower()
            if delivery_mode not in {'normal_vaginal', 'assisted_vaginal', 'c_section', 'referred'}:
                raise serializers.ValidationError({'payload': 'Delivery mode must be normal_vaginal, assisted_vaginal, c_section, or referred.'})

            baby_status = str(payload.get('baby_status', '')).strip().lower()
            if baby_status not in {'live_birth', 'stillbirth', 'early_neonatal_death'}:
                raise serializers.ValidationError({'payload': 'Baby status must be live_birth, stillbirth, or early_neonatal_death.'})

        if document_type == ClinicalDocument.DocumentType.ULTRASOUND and isinstance(payload, dict) and payload.get('gynecology_ultrasound'):
            patient_status = str(payload.get('patient_status', '')).strip().lower()
            if patient_status not in {'new', 'follow_up'}:
                raise serializers.ValidationError({'payload': 'Patient status must be new or follow_up for gynecology ultrasound reports.'})

            report_type = str(payload.get('report_type', '')).strip().lower()
            if report_type not in {'obstetric', 'pelvic'}:
                raise serializers.ValidationError({'payload': 'Report type must be obstetric or pelvic for gynecology ultrasound reports.'})

        if document_type == ClinicalDocument.DocumentType.RUTF and isinstance(payload, dict) and payload.get('malnutrition_record'):
            if patient and not patient.payments.filter(department__iexact='Malnutrition').exists():
                raise serializers.ValidationError({'patient': 'This patient is not registered in the Malnutrition department.'})

            appetite_test = str(payload.get('appetite_test', '')).strip().lower()
            if appetite_test not in {'pass', 'fail'}:
                raise serializers.ValidationError({'payload': 'Appetite test must be pass or fail.'})

            edema = str(payload.get('bilateral_edema', '')).strip().lower()
            if edema not in {'yes', 'no'}:
                raise serializers.ValidationError({'payload': 'Bilateral edema must be yes or no.'})

        if document_type == ClinicalDocument.DocumentType.FAMILY_PLANNING and isinstance(payload, dict):
            items = payload.get('items')
            if not isinstance(items, list) or not items:
                raise serializers.ValidationError({'payload': 'Add at least one family planning item.'})

            seen_medicines: set[int] = set()
            for item in items:
                if not isinstance(item, dict):
                    raise serializers.ValidationError({'payload': 'Each family planning item must be valid.'})
                medicine_id = item.get('medicine')
                if not isinstance(medicine_id, int):
                    raise serializers.ValidationError({'payload': 'Each family planning item must include a medicine id.'})
                if medicine_id in seen_medicines:
                    raise serializers.ValidationError({'payload': 'Each family planning item can only appear once.'})
                seen_medicines.add(medicine_id)
                try:
                    quantity = int(item.get('quantity') or 0)
                except (TypeError, ValueError):
                    quantity = 0
                if quantity <= 0:
                    raise serializers.ValidationError({'payload': 'Each family planning item must have a quantity greater than zero.'})

        return attrs


class MidwifeDashboardSerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=(('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly'), ('annual', 'Annual')))
    period_label = serializers.CharField()
    patients = serializers.IntegerField()
    anc_visits = serializers.IntegerField()
    pnc_visits = serializers.IntegerField()
    deliveries = serializers.IntegerField()
    high_risk = serializers.IntegerField()
    due_followups = serializers.IntegerField()
    total_records = serializers.IntegerField()
    patient_trend = serializers.ListField(child=serializers.DictField())
    recent_records_count = serializers.IntegerField()
    recent_records = ClinicalDocumentSerializer(many=True)


class MalnutritionDashboardSerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=(('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly'), ('annual', 'Annual')))
    period_label = serializers.CharField()
    patients = serializers.IntegerField()
    severe_cases = serializers.IntegerField()
    moderate_cases = serializers.IntegerField()
    edema_cases = serializers.IntegerField()
    appetite_failures = serializers.IntegerField()
    pending_pharmacy = serializers.IntegerField()
    approved_pharmacy = serializers.IntegerField()
    total_records = serializers.IntegerField()
    patient_trend = serializers.ListField(child=serializers.DictField())
    recent_records_count = serializers.IntegerField()
    recent_records = ClinicalDocumentSerializer(many=True)


class MedicineSerializer(serializers.ModelSerializer):
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Medicine
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_is_low_stock(self, obj) -> bool:
        return obj.current_stock <= obj.low_stock_threshold


class LabTestSerializer(serializers.ModelSerializer):
    component_count = serializers.SerializerMethodField()

    class Meta:
        model = LabTest
        fields = (
            'id',
            'name',
            'display_name',
            'category',
            'is_panel',
            'parent_panel',
            'sort_order',
            'normal_range_from',
            'normal_range_to',
            'unit',
            'is_active',
            'component_count',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at')

    def get_component_count(self, obj) -> int:
        annotated_count = getattr(obj, 'component_count', None)
        if annotated_count is not None:
            return int(annotated_count)
        return obj.components.filter(is_active=True).count() if obj.is_panel else 0


class MedicineStockMovementSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(source='medicine.name', read_only=True)

    class Meta:
        model = MedicineStockMovement
        fields = '__all__'
        read_only_fields = ('created_by', 'created_at', 'updated_at')


class WebsitePageContentSerializer(serializers.ModelSerializer):
    page_label = serializers.CharField(source='get_page_display', read_only=True)
    language_label = serializers.CharField(source='get_language_display', read_only=True)
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WebsitePageContent
        fields = (
            'id',
            'page_label',
            'language_label',
            'updated_by_name',
            'created_at',
            'updated_at',
            'page',
            'language',
            'content',
            'image_url',
            'image_file',
            'updated_by',
        )
        read_only_fields = ('updated_by', 'created_at', 'updated_at')

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['image_url'] = media_or_fallback_url(self.context.get('request'), instance.image_file, instance.image_url)
        return data

    def validate_content(self, value):
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError as exc:
                raise serializers.ValidationError('Content must be valid JSON.') from exc
        return value

    def validate_image_file(self, value):
        return validate_website_image_file(value)

    def get_updated_by_name(self, obj) -> str:
        return obj.updated_by.get_full_name() if obj.updated_by else ''


class WebsiteSettingsSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WebsiteSettings
        fields = (
            'id',
            'updated_by_name',
            'created_at',
            'updated_at',
            'logo_url',
            'logo_file',
            'updated_by',
        )
        read_only_fields = ('updated_by', 'created_at', 'updated_at')

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['logo_url'] = media_or_fallback_url(self.context.get('request'), instance.logo_file, instance.logo_url)
        return data

    def validate_logo_file(self, value):
        return validate_website_image_file(value)

    def get_updated_by_name(self, obj) -> str:
        return obj.updated_by.get_full_name() if obj.updated_by else ''
