import json
from io import BytesIO
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers
from PIL import Image, ImageOps, UnidentifiedImageError

from accounts.permissions import Role
from .models import AuditLog, CashBankTransaction, ClinicalDocument, DoctorDepartmentAssignment, EmergencyServicePrice, Expense, ExpenseCategory, ExpenseSubcategory, LabTest, Medicine, MedicineStockMovement, Patient, Payment, PrivateDocument, SalaryAdvance, SalaryAdvanceSettlement, SalaryPayment, VehicleExpenseDetails, WebsiteGalleryImage, WebsitePageContent, WebsitePost, WebsitePostImage, WebsiteSettings, round_up_to_ten
from .salary_rules import AFGHAN_MONTHS, calculate_afghanistan_salary_tax, current_afghan_date


MONEY_QUANT = Decimal('0.01')
MAX_WEBSITE_IMAGE_SIZE = 8 * 1024 * 1024
MAX_WEBSITE_POST_IMAGE_SIZE = 1024 * 1024
ALLOWED_WEBSITE_IMAGE_EXTENSIONS = {'.avif', '.gif', '.heic', '.jpeg', '.jpg', '.png', '.webp'}
ALLOWED_PRIVATE_DOCUMENT_EXTENSIONS = {'.docx', '.pdf', '.png', '.jpg', '.jpeg'}
ALLOWED_CASH_BANK_SLIP_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.webp'}
FREE_PAYMENT_DEPARTMENTS = {'vaccination', 'malnutrition'}
ASSIGNABLE_CLINICAL_ROLES = (Role.DOCTOR, Role.MIDWIFE, Role.GYNECOLOGIST)


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


def compress_website_post_image(file):
    """Return an upload smaller than 1 MB, converting only oversized files to JPEG."""
    extension = Path(file.name).suffix.lower()
    if extension not in {'.jpeg', '.jpg', '.png', '.webp'}:
        raise serializers.ValidationError('Website post photos must be JPG, PNG, or WEBP images.')
    if getattr(file, 'content_type', '') and not file.content_type.startswith('image/'):
        raise serializers.ValidationError('Upload an image file.')
    if file.size <= MAX_WEBSITE_POST_IMAGE_SIZE:
        return file

    try:
        source = Image.open(file)
        source = ImageOps.exif_transpose(source)
        if source.mode != 'RGB':
            background = Image.new('RGB', source.size, 'white')
            if source.mode == 'RGBA':
                background.paste(source, mask=source.getchannel('A'))
            else:
                background.paste(source.convert('RGB'))
            source = background
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise serializers.ValidationError('This photo could not be processed.') from exc

    for scale in (1, 0.85, 0.7, 0.55, 0.4):
        image = source if scale == 1 else source.resize(
            (max(1, int(source.width * scale)), max(1, int(source.height * scale))),
            Image.Resampling.LANCZOS,
        )
        for quality in (85, 75, 65, 55, 45):
            output = BytesIO()
            image.save(output, format='JPEG', quality=quality, optimize=True)
            if output.tell() < MAX_WEBSITE_POST_IMAGE_SIZE:
                filename = f'{Path(file.name).stem}.jpg'
                return ContentFile(output.getvalue(), name=filename)
    raise serializers.ValidationError('This photo could not be compressed below 1 MB. Please use a smaller photo.')


def validate_private_document_file(file, *, max_size_mb: Decimal):
    extension = Path(file.name).suffix.lower()
    if extension not in ALLOWED_PRIVATE_DOCUMENT_EXTENSIONS:
        raise serializers.ValidationError('Supported file types: DOCX, PDF, PNG, JPG, and JPEG.')
    if max_size_mb <= 0:
        raise serializers.ValidationError('Maximum file size must be greater than zero.')

    max_size_bytes = int((max_size_mb * Decimal('1024') * Decimal('1024')).quantize(Decimal('1')))
    if file.size > max_size_bytes:
        raise serializers.ValidationError(f'File size must be {max_size_mb} MB or smaller.')
    return file


def validate_cash_bank_slip_file(file):
    extension = Path(file.name).suffix.lower()
    if extension not in ALLOWED_CASH_BANK_SLIP_EXTENSIONS:
        raise serializers.ValidationError('Upload a PDF, PNG, JPG, JPEG, or WEBP slip.')
    if file.size > 8 * 1024 * 1024:
        raise serializers.ValidationError('Deposit and withdrawal slips must be 8 MB or smaller.')
    return file


def media_or_fallback_url(request, file, fallback: str) -> str:
    if file:
        url = file.url
        return request.build_absolute_uri(url) if request else url
    return fallback


def is_free_payment_department(department: str | None) -> bool:
    return (department or '').strip().lower() in FREE_PAYMENT_DEPARTMENTS


def normalize_age_unit(value: str | None, default: str) -> str:
    age_unit = str(value or default).strip().lower()
    return age_unit if age_unit in {Patient.AgeUnit.MONTH, Patient.AgeUnit.YEAR} else default


def validate_age_and_unit(age_value: int | None, age_unit: str, *, age_field: str, unit_field: str) -> None:
    if age_value is None:
        return
    if age_value < 0:
        raise serializers.ValidationError({age_field: 'Age cannot be negative.'})
    if age_unit == Patient.AgeUnit.MONTH and age_value >= 12:
        raise serializers.ValidationError({age_field: 'Month age must be less than 12.'})
    if age_unit == Patient.AgeUnit.YEAR and age_value == 0:
        raise serializers.ValidationError({unit_field: 'Use Month for patients younger than one year.'})


class DoctorDepartmentAssignmentSerializer(serializers.ModelSerializer):
    doctor_username = serializers.CharField(source='doctor.username', read_only=True)
    doctor_name = serializers.SerializerMethodField()
    assigned_by_username = serializers.CharField(source='assigned_by.username', read_only=True)

    class Meta:
        model = DoctorDepartmentAssignment
        fields = ('id', 'doctor', 'doctor_username', 'doctor_name', 'department', 'assigned_by_username', 'created_at', 'updated_at')
        read_only_fields = ('created_at', 'updated_at', 'assigned_by_username')

    def get_doctor_name(self, obj) -> str:
        return obj.doctor.get_full_name() or obj.doctor.username

    def validate_doctor(self, doctor):
        profile = getattr(doctor, 'staff_profile', None)
        if not doctor.is_active or profile is None or profile.deleted_at is not None or profile.role not in ASSIGNABLE_CLINICAL_ROLES:
            raise serializers.ValidationError('Select an active Doctor, Midwife, or Gynecologist account.')
        return doctor

    def validate_department(self, department):
        if department.strip().casefold() == 'opd':
            return 'Internal Medicines'
        return department


class PatientSerializer(serializers.ModelSerializer):
    registered_by_name = serializers.CharField(source='registered_by.get_full_name', read_only=True)

    class Meta:
        model = Patient
        fields = '__all__'
        read_only_fields = ('registration_number', 'registered_by', 'created_at', 'updated_at')

    def validate(self, attrs):
        attrs = super().validate(attrs)
        age = attrs.get('age', getattr(self.instance, 'age', None))
        age_unit = normalize_age_unit(attrs.get('age_unit', getattr(self.instance, 'age_unit', Patient.AgeUnit.YEAR)), Patient.AgeUnit.YEAR)
        validate_age_and_unit(age, age_unit, age_field='age', unit_field='age_unit')
        attrs['age_unit'] = age_unit
        return attrs


class PaymentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.__str__', read_only=True)
    patient_full_name = serializers.SerializerMethodField()
    midwifery_service = serializers.CharField(required=False, allow_blank=True)
    midwifery_service_label = serializers.SerializerMethodField()
    midwifery_fp_service_label = serializers.CharField(source='get_midwifery_fp_service_display', read_only=True)
    emergency_service = serializers.CharField(required=False, allow_blank=True)
    emergency_service_label = serializers.CharField(source='get_emergency_service_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
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

    def get_midwifery_service_label(self, obj) -> str:
        service_label = dict(Payment.MidwiferyService.choices).get(
            obj.midwifery_service,
            Payment.LEGACY_MIDWIFERY_SERVICE_LABELS.get(obj.midwifery_service, obj.midwifery_service),
        )
        if obj.midwifery_service == Payment.MidwiferyService.FP and obj.midwifery_fp_service:
            return f'{service_label} — {obj.get_midwifery_fp_service_display()}'
        return service_label

    def validate(self, attrs):
        attrs = super().validate(attrs)
        department = attrs.get('department', getattr(self.instance, 'department', ''))
        if department.strip().casefold() == 'opd':
            department = 'Internal Medicines'
            attrs['department'] = department
        normalized_department = (department or '').strip().lower()
        midwifery_service = attrs.get('midwifery_service', getattr(self.instance, 'midwifery_service', ''))
        midwifery_fp_service = attrs.get('midwifery_fp_service', getattr(self.instance, 'midwifery_fp_service', ''))
        emergency_service = attrs.get('emergency_service', getattr(self.instance, 'emergency_service', ''))
        emergency_service_fee = attrs.get('emergency_service_fee', getattr(self.instance, 'emergency_service_fee', Decimal('0'))) or Decimal('0')
        patient_age = attrs.get('patient_age', getattr(self.instance, 'patient_age', None))
        patient_age_unit = normalize_age_unit(
            attrs.get('patient_age_unit', getattr(self.instance, 'patient_age_unit', Patient.AgeUnit.YEAR)),
            Patient.AgeUnit.YEAR,
        )
        doctor_fee = attrs.get('doctor_fee', getattr(self.instance, 'doctor_fee', Decimal('0'))) or Decimal('0')
        payment_type = attrs.get('payment_type', getattr(self.instance, 'payment_type', Payment.PaymentType.FULL))
        discount_percentage = attrs.get('discount_percentage', getattr(self.instance, 'discount_percentage', Decimal('0'))) or Decimal('0')

        validate_age_and_unit(patient_age, patient_age_unit, age_field='patient_age', unit_field='patient_age_unit')

        if is_free_payment_department(department):
            doctor_fee = Decimal('0')
            emergency_service_fee = Decimal('0')
            payment_type = Payment.PaymentType.FREE
            discount_percentage = Decimal('100')
        elif normalized_department == 'emergency':
            doctor_fee = Decimal('0')
            allowed_emergency_services = dict(Payment.EmergencyService.choices)
            changing_emergency_service = self.instance is None or 'department' in attrs or 'emergency_service' in attrs
            if changing_emergency_service and emergency_service not in allowed_emergency_services:
                raise serializers.ValidationError({'emergency_service': 'Select a valid Emergency service.'})
            if emergency_service in allowed_emergency_services:
                configured_price = EmergencyServicePrice.objects.filter(service=emergency_service).values_list('price', flat=True).first()
                if configured_price is None:
                    raise serializers.ValidationError({'emergency_service': 'This Emergency service does not have a configured price.'})
                emergency_service_fee = configured_price if changing_emergency_service else getattr(self.instance, 'emergency_service_fee', Decimal('0'))

        if doctor_fee < 0:
            raise serializers.ValidationError({'doctor_fee': 'Doctor fee cannot be negative.'})
        if emergency_service_fee < 0:
            raise serializers.ValidationError({'emergency_service_fee': 'Emergency service fee cannot be negative.'})
        if discount_percentage < 0 or discount_percentage > 100:
            raise serializers.ValidationError({'discount_percentage': 'Discount must be between 0 and 100.'})

        doctor_fee = money(doctor_fee)
        emergency_service_fee = money(emergency_service_fee)
        billable_fee = emergency_service_fee if normalized_department == 'emergency' else doctor_fee
        if payment_type == Payment.PaymentType.FREE:
            discount_percentage = Decimal('100')
            discount_amount = billable_fee
            amount = Decimal('0')
        elif payment_type == Payment.PaymentType.DISCOUNT:
            discount_amount = money(billable_fee * discount_percentage / Decimal('100'))
            amount = money(billable_fee - discount_amount)
        else:
            discount_percentage = Decimal('0')
            discount_amount = Decimal('0')
            amount = billable_fee

        attrs['doctor_fee'] = doctor_fee
        attrs['emergency_service_fee'] = emergency_service_fee if normalized_department == 'emergency' else Decimal('0')
        attrs['discount_percentage'] = money(discount_percentage)
        attrs['discount_amount'] = money(discount_amount)
        attrs['amount'] = money(round_up_to_ten(amount))
        attrs['patient_age_unit'] = patient_age_unit
        if normalized_department == 'midwifery':
            changing_midwifery_service = self.instance is None or 'department' in attrs or 'midwifery_service' in attrs or 'midwifery_fp_service' in attrs
            allowed_midwifery_services = dict(Payment.MidwiferyService.choices)
            is_unchanged_legacy_service = bool(
                self.instance
                and midwifery_service == self.instance.midwifery_service
                and midwifery_service in Payment.LEGACY_MIDWIFERY_SERVICE_LABELS
            )
            if midwifery_service and midwifery_service not in allowed_midwifery_services and not is_unchanged_legacy_service:
                raise serializers.ValidationError({'midwifery_service': 'Select a valid Midwifery service.'})
            if changing_midwifery_service and not midwifery_service:
                raise serializers.ValidationError({'midwifery_service': 'Select a Midwifery service.'})
            if midwifery_service == Payment.MidwiferyService.FP:
                if changing_midwifery_service and not midwifery_fp_service:
                    raise serializers.ValidationError({'midwifery_fp_service': 'Select an FP service.'})
                if midwifery_fp_service:
                    attrs['service'] = f"{department}: {Payment.MidwiferyService.FP.label} — {Payment.MidwiferyFpService(midwifery_fp_service).label}"
            elif midwifery_service in dict(Payment.MidwiferyService.choices):
                attrs['midwifery_fp_service'] = ''
                attrs['service'] = f"{department}: {Payment.MidwiferyService(midwifery_service).label}"
            elif is_unchanged_legacy_service:
                attrs['midwifery_fp_service'] = ''
                attrs['service'] = f"{department}: {Payment.LEGACY_MIDWIFERY_SERVICE_LABELS[midwifery_service]}"
        else:
            attrs['midwifery_service'] = ''
            attrs['midwifery_fp_service'] = ''
        if normalized_department == 'emergency':
            changing_emergency_service = self.instance is None or 'department' in attrs or 'emergency_service' in attrs
            allowed_emergency_services = dict(Payment.EmergencyService.choices)
            if changing_emergency_service and not emergency_service:
                raise serializers.ValidationError({'emergency_service': 'Select an Emergency service.'})
            if emergency_service in allowed_emergency_services:
                attrs['service'] = f"{department}: {Payment.EmergencyService(emergency_service).label}"
        else:
            attrs['emergency_service'] = ''
        if not attrs.get('service') and attrs.get('department'):
            attrs['service'] = f"{attrs['department']} consultation"
        return attrs


class EmergencyServicePriceSerializer(serializers.ModelSerializer):
    label = serializers.CharField(source='get_service_display', read_only=True)

    class Meta:
        model = EmergencyServicePrice
        fields = ('id', 'service', 'label', 'price', 'updated_at')
        read_only_fields = ('id', 'service', 'label', 'updated_at')

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError('Price cannot be negative.')
        return money(value)


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = ('id', 'actor', 'actor_name', 'action', 'resource', 'target_id', 'endpoint', 'status_code', 'ip_address', 'created_at')
        read_only_fields = fields

    def get_actor_name(self, obj) -> str:
        if obj.actor is None:
            return 'System'
        return obj.actor.get_full_name() or obj.actor.username


class CashBankTransactionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    transaction_type_label = serializers.CharField(source='get_transaction_type_display', read_only=True)
    slip_url = serializers.SerializerMethodField()
    slip_name = serializers.SerializerMethodField()

    class Meta:
        model = CashBankTransaction
        fields = (
            'id', 'transaction_type', 'transaction_type_label', 'amount', 'currency',
            'depositor_name', 'withdrawer_name', 'reason', 'slip', 'slip_url', 'slip_name', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
        )
        read_only_fields = ('created_by', 'created_at', 'updated_at')

    def validate_amount(self, value):
        value = money(value)
        if value <= 0:
            raise serializers.ValidationError('Amount must be greater than zero.')
        return value

    def validate_slip(self, value):
        return validate_cash_bank_slip_file(value)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        transaction_type = attrs.get('transaction_type', getattr(self.instance, 'transaction_type', None))
        depositor_name = attrs.get('depositor_name', getattr(self.instance, 'depositor_name', ''))
        withdrawer_name = attrs.get('withdrawer_name', getattr(self.instance, 'withdrawer_name', ''))
        if transaction_type == CashBankTransaction.TransactionType.DEPOSIT:
            if not depositor_name.strip():
                raise serializers.ValidationError({'depositor_name': 'Depositor name is required for a deposit.'})
            attrs['withdrawer_name'] = ''
        elif transaction_type == CashBankTransaction.TransactionType.WITHDRAWAL:
            if not withdrawer_name.strip():
                raise serializers.ValidationError({'withdrawer_name': 'Withdrawer name is required for a withdrawal.'})
            attrs['depositor_name'] = ''
        return attrs

    def get_slip_url(self, obj) -> str:
        request = self.context.get('request')
        if not obj.slip:
            return ''
        url = obj.slip.url
        return request.build_absolute_uri(url) if request else url

    def get_slip_name(self, obj) -> str:
        return Path(obj.slip.name).name if obj.slip else ''


class VehicleExpenseDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleExpenseDetails
        exclude = ('expense', 'created_at', 'updated_at')

    def validate(self, attrs):
        attrs = super().validate(attrs)
        expense_type = attrs.get('expense_type', getattr(self.instance, 'expense_type', None))
        errors = {}

        def value_for(field):
            return attrs.get(field, getattr(self.instance, field, None))

        if not value_for('number_plate'):
            errors['number_plate'] = 'Number plate is required.'
        if not value_for('driver_name'):
            errors['driver_name'] = 'Driver name is required.'
        if value_for('vehicle_odometer_km') is None:
            errors['vehicle_odometer_km'] = 'Vehicle odometer is required.'

        if expense_type == VehicleExpenseDetails.ExpenseType.FUEL:
            for field in ('fuel_type', 'quantity_liters', 'price_per_liter', 'fuel_station_supplier', 'invoice_number'):
                if not value_for(field):
                    errors[field] = 'This field is required for fuel expenses.'
            if value_for('quantity_liters') is not None and value_for('quantity_liters') <= 0:
                errors['quantity_liters'] = 'Quantity must be greater than zero.'
            if value_for('price_per_liter') is not None and value_for('price_per_liter') <= 0:
                errors['price_per_liter'] = 'Price per liter must be greater than zero.'
            attrs.update({'workshop': ''})
        elif expense_type == VehicleExpenseDetails.ExpenseType.MAINTENANCE:
            if not value_for('workshop'):
                errors['workshop'] = 'Workshop is required for vehicle maintenance.'
            attrs.update({
                'fuel_type': '',
                'quantity_liters': None,
                'price_per_liter': None,
                'fuel_station_supplier': '',
                'invoice_number': '',
            })
        else:
            errors['expense_type'] = 'Select Fuel or Vehicle maintenance.'

        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class ExpenseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    category_label = serializers.SerializerMethodField()
    vehicle_details = VehicleExpenseDetailsSerializer(required=False, allow_null=True)

    class Meta:
        model = Expense
        fields = '__all__'
        read_only_fields = ('voucher_number', 'created_by', 'created_at', 'updated_at', 'salary_payment', 'salary_advance')

    def validate_amount(self, value):
        value = money(value)
        if value <= 0:
            raise serializers.ValidationError('Expense amount must be greater than zero.')
        return value

    def validate_category(self, value):
        if not ExpenseSubcategory.objects.filter(code=value).exists():
            raise serializers.ValidationError('Select a valid expense subcategory.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        vehicle_details = attrs.get('vehicle_details', serializers.empty)
        category = attrs.get('category', getattr(self.instance, 'category', ''))
        payment_method = attrs.get('payment_method', getattr(self.instance, 'payment_method', Expense.PaymentMethod.CASH))
        errors = {}

        def value_for(field):
            return attrs.get(field, getattr(self.instance, field, None))

        if payment_method == Expense.PaymentMethod.BANK_TRANSFER:
            for field in ('bank_name', 'bank_account', 'transfer_reference_number', 'transfer_date', 'paid_to_received_from'):
                if not value_for(field):
                    errors[field] = 'This field is required for a bank transfer.'
            attrs['cheque_number'] = ''
            attrs['cheque_date'] = None
            attrs['cheque_status'] = Expense.ChequeStatus.PENDING
        elif payment_method == Expense.PaymentMethod.CHEQUE:
            for field in ('bank_name', 'cheque_number', 'cheque_date', 'paid_to_received_from', 'cheque_status'):
                if not value_for(field):
                    errors[field] = 'This field is required for a cheque payment.'
            attrs['bank_account'] = ''
            attrs['transfer_reference_number'] = ''
            attrs['transfer_date'] = None
        else:
            attrs.update({
                'bank_name': '',
                'bank_account': '',
                'transfer_reference_number': '',
                'transfer_date': None,
                'cheque_number': '',
                'cheque_date': None,
                'cheque_status': Expense.ChequeStatus.PENDING,
                'paid_to_received_from': '',
            })

        if category == Expense.VEHICLE_TRANSPORT_CATEGORY:
            if vehicle_details is serializers.empty:
                if self.instance is None or not hasattr(self.instance, 'vehicle_details'):
                    errors['vehicle_details'] = 'Vehicle details are required for this expense category.'
            elif vehicle_details is None:
                errors['vehicle_details'] = 'Vehicle details are required for this expense category.'
            elif vehicle_details.get('expense_type') == VehicleExpenseDetails.ExpenseType.FUEL:
                attrs['amount'] = money(vehicle_details['quantity_liters'] * vehicle_details['price_per_liter'])
        elif vehicle_details not in (serializers.empty, None):
            errors['vehicle_details'] = 'Vehicle details can only be used for transport and work travel (E-06).'

        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        vehicle_details = validated_data.pop('vehicle_details', None)
        expense = super().create(validated_data)
        if vehicle_details is not None:
            VehicleExpenseDetails.objects.create(expense=expense, **vehicle_details)
        return expense

    @transaction.atomic
    def update(self, instance, validated_data):
        vehicle_details = validated_data.pop('vehicle_details', serializers.empty)
        expense = super().update(instance, validated_data)
        if expense.category == Expense.VEHICLE_TRANSPORT_CATEGORY:
            if vehicle_details is not serializers.empty:
                VehicleExpenseDetails.objects.update_or_create(expense=expense, defaults=vehicle_details)
        elif hasattr(expense, 'vehicle_details'):
            expense.vehicle_details.delete()
        return expense

    def get_category_label(self, obj) -> str:
        labels = self.context.setdefault('expense_subcategory_labels', {})
        if obj.category not in labels:
            subcategory = (
                ExpenseSubcategory.objects
                .select_related('category')
                .filter(code=obj.category)
                .first()
            )
            labels[obj.category] = (
                f'{subcategory.category.display_title} — {subcategory.display_title}'
                if subcategory else obj.category
            )
        return labels[obj.category]


class ExpenseSubcategorySerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    display_title = serializers.CharField(read_only=True)

    class Meta:
        model = ExpenseSubcategory
        fields = ('id', 'code', 'title_dari', 'title_pashto', 'title_english', 'display_title')
        extra_kwargs = {'code': {'validators': []}}

    def validate_code(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Subcategory code is required.')
        return value

    def validate(self, attrs):
        titles = (
            attrs.get('title_dari', '').strip(),
            attrs.get('title_pashto', '').strip(),
            attrs.get('title_english', '').strip(),
        )
        if not any(titles):
            raise serializers.ValidationError('Provide a title in at least one language.')
        return attrs


class ExpenseCategorySerializer(serializers.ModelSerializer):
    subcategories = ExpenseSubcategorySerializer(many=True)
    display_title = serializers.CharField(read_only=True)

    class Meta:
        model = ExpenseCategory
        fields = ('id', 'title_dari', 'title_pashto', 'title_english', 'display_title', 'subcategories', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at')

    def validate(self, attrs):
        titles = (
            attrs.get('title_dari', getattr(self.instance, 'title_dari', '')).strip(),
            attrs.get('title_pashto', getattr(self.instance, 'title_pashto', '')).strip(),
            attrs.get('title_english', getattr(self.instance, 'title_english', '')).strip(),
        )
        if not any(titles):
            raise serializers.ValidationError('Provide a category title in at least one language.')
        return attrs

    def validate_subcategories(self, subcategories):
        if not subcategories:
            raise serializers.ValidationError('Add at least one subcategory.')

        seen_codes = set()
        for subcategory in subcategories:
            code = subcategory['code']
            normalized_code = code.casefold()
            if normalized_code in seen_codes:
                raise serializers.ValidationError(f'Subcategory code "{code}" is listed more than once.')
            seen_codes.add(normalized_code)

            existing = ExpenseSubcategory.objects.filter(code__iexact=code)
            subcategory_id = subcategory.get('id')
            if subcategory_id:
                existing = existing.exclude(pk=subcategory_id)
            if existing.exists():
                raise serializers.ValidationError(f'Subcategory code "{code}" is already in use.')
        return subcategories

    def _save_subcategories(self, category, subcategories):
        existing = {subcategory.id: subcategory for subcategory in category.subcategories.all()}
        submitted_ids = set()
        for subcategory_data in subcategories:
            subcategory_id = subcategory_data.pop('id', None)
            if subcategory_id is None:
                ExpenseSubcategory.objects.create(category=category, **subcategory_data)
                continue
            subcategory = existing.get(subcategory_id)
            if subcategory is None:
                raise serializers.ValidationError({'subcategories': 'A subcategory does not belong to this category.'})
            submitted_ids.add(subcategory_id)
            for field, value in subcategory_data.items():
                setattr(subcategory, field, value)
            subcategory.save()

        removed_subcategories = [
            subcategory for subcategory_id, subcategory in existing.items()
            if subcategory_id not in submitted_ids
        ]
        used_codes = [subcategory.code for subcategory in removed_subcategories]
        if used_codes and Expense.objects.filter(category__in=used_codes).exists():
            raise serializers.ValidationError({'subcategories': 'A subcategory with recorded expenses cannot be removed.'})
        if removed_subcategories:
            ExpenseSubcategory.objects.filter(pk__in=[subcategory.id for subcategory in removed_subcategories]).delete()

    def create(self, validated_data):
        subcategories = validated_data.pop('subcategories')
        with transaction.atomic():
            category = ExpenseCategory.objects.create(**validated_data)
            self._save_subcategories(category, subcategories)
        return category

    def update(self, instance, validated_data):
        subcategories = validated_data.pop('subcategories')
        with transaction.atomic():
            instance.title_dari = validated_data.get('title_dari', instance.title_dari)
            instance.title_pashto = validated_data.get('title_pashto', instance.title_pashto)
            instance.title_english = validated_data.get('title_english', instance.title_english)
            instance.save(update_fields=['title_dari', 'title_pashto', 'title_english', 'updated_at'])
            self._save_subcategories(instance, subcategories)
        return instance


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
            if patient and not patient.payments.filter(department__iexact='Midwifery').exists():
                raise serializers.ValidationError({'patient': 'This patient is not registered in the Midwifery department.'})

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
    period = serializers.ChoiceField(choices=(('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly'), ('annual', 'Annual'), ('custom', 'Custom')))
    period_label = serializers.CharField()
    patients = serializers.IntegerField()
    approved_patients = serializers.IntegerField()
    pending_patients = serializers.IntegerField()
    prescriptions = serializers.IntegerField()
    laboratory_orders = serializers.IntegerField()
    doctor_departments = serializers.ListField(child=serializers.DictField())


class VaccinationDashboardSerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=(('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly'), ('annual', 'Annual'), ('custom', 'Custom')))
    period_label = serializers.CharField()
    registered_patients = serializers.IntegerField()


class EmergencyDoctorDashboardSerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=(('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly'), ('annual', 'Annual'), ('custom', 'Custom')))
    period_label = serializers.CharField()
    patients = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    services = serializers.ListField(child=serializers.DictField())


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
    components = serializers.SerializerMethodField()

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
            'components',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at')

    def get_component_count(self, obj) -> int:
        annotated_count = getattr(obj, 'component_count', None)
        if annotated_count is not None:
            return int(annotated_count)
        return obj.components.filter(is_active=True).count() if obj.is_panel else 0

    def get_components(self, obj) -> list[dict]:
        if not obj.is_panel:
            return []
        return [
            {
                'id': component.id,
                'name': component.name,
                'display_name': component.display_name,
                'normal_range_from': component.normal_range_from,
                'normal_range_to': component.normal_range_to,
                'unit': component.unit,
            }
            for component in obj.components.filter(is_active=True).order_by('sort_order', 'name')
        ]


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
            'header_content',
            'social_links',
            'updated_by',
        )
        read_only_fields = ('updated_by', 'created_at', 'updated_at')

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['logo_url'] = media_or_fallback_url(self.context.get('request'), instance.logo_file, instance.logo_url)
        return data

    def validate_logo_file(self, value):
        return validate_website_image_file(value)

    def validate_header_content(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Header content must be an object.')

        allowed_languages = {'en', 'fa', 'ps'}
        allowed_navigation = {'home', 'posts', 'gallery', 'about', 'mission', 'vision', 'services', 'contact'}
        for language, content in value.items():
            if language not in allowed_languages or not isinstance(content, dict):
                raise serializers.ValidationError('Header content must use valid language entries.')
            if 'brand_subtitle' in content and not isinstance(content['brand_subtitle'], str):
                raise serializers.ValidationError('Header brand subtitle must be text.')
            if 'nav' in content:
                navigation = content['nav']
                if not isinstance(navigation, dict) or any(key not in allowed_navigation or not isinstance(label, str) for key, label in navigation.items()):
                    raise serializers.ValidationError('Header navigation labels must be text.')
        return value

    def validate_social_links(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Social media links must be an object.')

        allowed_links = {'facebook', 'x', 'telegram', 'whatsapp'}
        if any(key not in allowed_links for key in value):
            raise serializers.ValidationError('Social media links contain an unsupported service.')
        for link in value.values():
            if not isinstance(link, str):
                raise serializers.ValidationError('Each social media link must be text.')
            if link and not (link.startswith('https://') or link.startswith('http://')):
                raise serializers.ValidationError('Each social media link must start with http:// or https://.')
        return value

    def get_updated_by_name(self, obj) -> str:
        return obj.updated_by.get_full_name() if obj.updated_by else ''


class WebsitePostImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    file_size_bytes = serializers.SerializerMethodField()

    class Meta:
        model = WebsitePostImage
        fields = ('id', 'image', 'image_url', 'file_size_bytes', 'created_at')
        read_only_fields = fields

    def get_image_url(self, obj) -> str:
        request = self.context.get('request')
        if not obj.image:
            return ''
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url

    def get_file_size_bytes(self, obj) -> int:
        return int(obj.image.size) if obj.image else 0


class WebsitePostSerializer(serializers.ModelSerializer):
    images = WebsitePostImageSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    updated_by_name = serializers.CharField(source='updated_by.get_full_name', read_only=True)

    class Meta:
        model = WebsitePost
        fields = (
            'id',
            'title_en', 'title_fa', 'title_ps',
            'content_en', 'content_fa', 'content_ps',
            'images',
            'created_by', 'created_by_name',
            'updated_by', 'updated_by_name',
            'created_at', 'updated_at',
        )
        read_only_fields = ('created_by', 'updated_by', 'created_at', 'updated_at')

    def validate(self, attrs):
        attrs = super().validate(attrs)
        errors = {}
        for field in ('title_en', 'title_fa', 'title_ps', 'content_en', 'content_fa', 'content_ps'):
            value = attrs.get(field, getattr(self.instance, field, ''))
            if not str(value or '').strip():
                errors[field] = 'This language is required.'
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class WebsiteGalleryImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    file_size_bytes = serializers.SerializerMethodField()
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)

    class Meta:
        model = WebsiteGalleryImage
        fields = ('id', 'image', 'image_url', 'file_size_bytes', 'uploaded_by_name', 'created_at')
        read_only_fields = fields

    def get_image_url(self, obj) -> str:
        request = self.context.get('request')
        if not obj.image:
            return ''
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url

    def get_file_size_bytes(self, obj) -> int:
        return int(obj.image.size) if obj.image else 0


class PrivateDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()
    file_extension = serializers.SerializerMethodField()
    file_size_bytes = serializers.SerializerMethodField()

    class Meta:
        model = PrivateDocument
        fields = (
            'id',
            'title',
            'category',
            'file',
            'file_url',
            'file_name',
            'file_extension',
            'file_size_bytes',
            'max_size_mb',
            'uploaded_by',
            'uploaded_by_name',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('uploaded_by', 'created_at', 'updated_at')

    def get_file_url(self, obj) -> str:
        request = self.context.get('request')
        if not obj.file:
            return ''
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url

    def get_file_name(self, obj) -> str:
        return Path(obj.file.name).name if obj.file else ''

    def get_file_extension(self, obj) -> str:
        return Path(obj.file.name).suffix.lower().lstrip('.') if obj.file else ''

    def get_file_size_bytes(self, obj) -> int:
        return int(obj.file.size) if obj.file else 0

    def validate_max_size_mb(self, value):
        value = money(value)
        if value <= 0:
            raise serializers.ValidationError('Maximum file size must be greater than zero.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        max_size_mb = attrs.get('max_size_mb', getattr(self.instance, 'max_size_mb', Decimal('1')))
        file = attrs.get('file')
        if file is not None:
            validate_private_document_file(file, max_size_mb=max_size_mb)
        elif self.instance is None:
            raise serializers.ValidationError({'file': 'Upload a file.'})
        return attrs
