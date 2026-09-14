from decimal import Decimal, ROUND_CEILING

from django.conf import settings
from django.db import models, transaction

from shared.soft_delete import SoftDeleteModel


def round_up_to_ten(value) -> Decimal:
    """Round a positive Afghanis amount up to the next 10 AFN."""
    amount = Decimal(value)
    if amount <= 0:
        return Decimal('0.00')
    return (amount / Decimal('10')).quantize(Decimal('1'), rounding=ROUND_CEILING) * Decimal('10')


def cash_bank_slip_upload_path(instance, filename: str) -> str:
    return f'cash-bank-slips/{instance.transaction_type}/{filename}'


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class DoctorDepartmentAssignment(TimestampedModel):
    """A department assignment for an active clinical staff login account."""

    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='doctor_department_assignments',
    )
    department = models.CharField(max_length=120)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_doctor_departments',
    )

    class Meta:
        ordering = ('department', 'doctor__username')
        constraints = (
            models.UniqueConstraint(fields=('doctor', 'department'), name='unique_clinical_staff_department'),
        )

    def __str__(self) -> str:
        return f'{self.doctor.username} - {self.department}'


class Patient(TimestampedModel, SoftDeleteModel):
    class Gender(models.TextChoices):
        FEMALE = 'female', 'Female'
        MALE = 'male', 'Male'
        OTHER = 'other', 'Other'

    class AgeUnit(models.TextChoices):
        MONTH = 'month', 'Month'
        YEAR = 'year', 'Year'

    registration_number = models.CharField(max_length=32, unique=True)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80, blank=True)
    age = models.PositiveIntegerField(null=True, blank=True)
    age_unit = models.CharField(max_length=8, choices=AgeUnit.choices, default=AgeUnit.YEAR)
    gender = models.CharField(max_length=16, choices=Gender.choices)
    date_of_birth = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    address = models.CharField(max_length=255, blank=True)
    guardian_name = models.CharField(max_length=120, blank=True)
    registered_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='registered_patients')

    class Meta:
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return f'{self.registration_number} - {self.first_name} {self.last_name}'.strip()


class Payment(TimestampedModel, SoftDeleteModel):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'

    class PaymentType(models.TextChoices):
        FULL = 'full', 'Full payment'
        FREE = 'free', 'Free'
        DISCOUNT = 'discount', 'Discount'

    class MidwiferyService(models.TextChoices):
        ANC = 'anc', 'ANC'
        PNC = 'pnc', 'PNC'
        NORMAL_DELIVERY = 'normal_delivery', 'Normal delivery'
        FP = 'fp', 'FP'

    class MidwiferyFpService(models.TextChoices):
        FP = 'fp', 'FP'
        IUD_INSERTION = 'iud_insertion', 'Insertion of IUD'
        IUD_REMOVAL = 'iud_removal', 'Removal of IUD'
        IMPLANT = 'implant', 'Implant'
        CAPSULE_INSERTION = 'capsule_insertion', 'Insertion of capsule'
        CAPSULE_REMOVAL = 'capsule_removal', 'Removal of capsule'

    LEGACY_MIDWIFERY_SERVICE_LABELS = {
        'iud_insertion': 'Insertion of IUD',
        'iud_removal': 'Removal of IUD',
        'implant_insertion': 'Insertion of implant',
        'implant_removal': 'Removal of implant',
        'coc_tablet': 'COC tablet',
        'pop_tablet': 'POP tablet',
        'condom': 'Condom',
        'dmpa': 'DMPA',
        'emergency_tablets': 'Emergency Tablets',
        'delivery': 'Delivery',
    }

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='payments')
    service = models.CharField(max_length=120)
    department = models.CharField(max_length=120, blank=True)
    midwifery_service = models.CharField(max_length=32, choices=MidwiferyService.choices, blank=True, default='')
    midwifery_fp_service = models.CharField(max_length=32, choices=MidwiferyFpService.choices, blank=True, default='')
    doctor_name = models.CharField(max_length=120, blank=True)
    patient_age = models.PositiveIntegerField(null=True, blank=True)
    patient_age_unit = models.CharField(max_length=8, choices=Patient.AgeUnit.choices, default=Patient.AgeUnit.YEAR)
    doctor_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_type = models.CharField(max_length=16, choices=PaymentType.choices, default=PaymentType.FULL)
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='created_payments')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name='approved_payments')
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-created_at',)


class SalaryPayment(TimestampedModel, SoftDeleteModel):
    employee = models.ForeignKey('accounts.Employee', on_delete=models.PROTECT, related_name='salary_payments')
    afghan_year = models.PositiveIntegerField()
    months = models.JSONField(default=list, blank=True)
    absence_days = models.PositiveIntegerField(default=0)
    advance_payment = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    advance_balance_carried = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monthly_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gross_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    absence_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    taxable_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payable_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_salary_payments',
    )

    class Meta:
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return f'Salary payment - {self.employee} - {self.afghan_year}'


class SalaryAdvance(TimestampedModel, SoftDeleteModel):
    employee = models.ForeignKey('accounts.Employee', on_delete=models.PROTECT, related_name='salary_advances')
    afghan_year = models.PositiveIntegerField()
    afghan_month = models.CharField(max_length=24)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_salary_advances',
    )

    class Meta:
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return f'Salary advance - {self.employee} - {self.amount}'


class SalaryAdvanceSettlement(TimestampedModel):
    salary_advance = models.ForeignKey(SalaryAdvance, on_delete=models.CASCADE, related_name='settlements')
    salary_payment = models.ForeignKey(SalaryPayment, on_delete=models.CASCADE, related_name='advance_settlements')
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ('created_at', 'id')


class ExpenseVoucherSequence(models.Model):
    last_number = models.PositiveBigIntegerField(default=0)


class VehicleExpenseVoucherSequence(models.Model):
    last_number = models.PositiveBigIntegerField(default=0)


def next_expense_voucher_number() -> str:
    with transaction.atomic():
        sequence = ExpenseVoucherSequence.objects.select_for_update().get(pk=1)
        sequence.last_number += 1
        sequence.save(update_fields=['last_number'])
        return f'VCH-{sequence.last_number:05d}'


def next_vehicle_expense_voucher_number() -> str:
    with transaction.atomic():
        sequence = VehicleExpenseVoucherSequence.objects.select_for_update().get(pk=1)
        sequence.last_number += 1
        sequence.save(update_fields=['last_number'])
        return f'VCH-car-{sequence.last_number:05d}'


class Expense(TimestampedModel, SoftDeleteModel):
    VEHICLE_TRANSPORT_CATEGORY = 'E-06'
    class PaymentMethod(models.TextChoices):
        CASH = 'cash', 'Cash'
        BANK_TRANSFER = 'bank_transfer', 'Bank transfer'
        CHEQUE = 'cheque', 'Cheque'

    class ChequeStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        CLEARED = 'cleared', 'Cleared'
        BOUNCED = 'bounced', 'Bounced'
        CANCELLED = 'cancelled', 'Cancelled'

    voucher_number = models.CharField(max_length=24, unique=True)
    name = models.CharField(max_length=180, blank=True, default='')
    category = models.CharField(max_length=120)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    description = models.TextField(blank=True)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    bank_name = models.CharField(max_length=180, blank=True, default='')
    bank_account = models.CharField(max_length=180, blank=True, default='')
    transfer_reference_number = models.CharField(max_length=180, blank=True, default='')
    transfer_date = models.DateField(null=True, blank=True)
    cheque_number = models.CharField(max_length=180, blank=True, default='')
    cheque_date = models.DateField(null=True, blank=True)
    cheque_status = models.CharField(max_length=20, choices=ChequeStatus.choices, default=ChequeStatus.PENDING)
    paid_to_received_from = models.CharField(max_length=180, blank=True, default='')
    funding_source = models.CharField(max_length=180, blank=True, default='')
    project_activity = models.CharField(max_length=180, blank=True, default='')
    department = models.CharField(max_length=120, blank=True, default='')
    salary_payment = models.OneToOneField(
        'SalaryPayment',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='linked_expense',
    )
    salary_advance = models.OneToOneField(
        'SalaryAdvance',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='linked_expense',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_expenses',
    )

    class Meta:
        ordering = ('-created_at',)

    def save(self, *args, **kwargs):
        if not self.voucher_number:
            self.voucher_number = (
                next_vehicle_expense_voucher_number()
                if self.category == self.VEHICLE_TRANSPORT_CATEGORY
                else next_expense_voucher_number()
            )
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f'{self.voucher_number}: {self.name} ({self.category})'


class VehicleExpenseDetails(TimestampedModel):
    class ExpenseType(models.TextChoices):
        FUEL = 'fuel', 'Fuel'
        MAINTENANCE = 'maintenance', 'Vehicle maintenance'

    class FuelType(models.TextChoices):
        DIESEL = 'diesel', 'Diesel'
        PETROL = 'petrol', 'Petrol'
        GAS = 'gas', 'Gas'

    expense = models.OneToOneField(Expense, on_delete=models.CASCADE, related_name='vehicle_details')
    number_plate = models.CharField(max_length=64)
    driver_name = models.CharField(max_length=180, blank=True, default='')
    source = models.CharField(max_length=180, blank=True, default='')
    destination = models.CharField(max_length=180, blank=True, default='')
    travel_purpose = models.TextField(blank=True, default='')
    expense_type = models.CharField(max_length=20, choices=ExpenseType.choices)
    fuel_type = models.CharField(max_length=16, choices=FuelType.choices, blank=True, default='')
    quantity_liters = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    price_per_liter = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    vehicle_odometer_km = models.PositiveBigIntegerField()
    fuel_station_supplier = models.CharField(max_length=180, blank=True, default='')
    invoice_number = models.CharField(max_length=180, blank=True, default='')
    workshop = models.CharField(max_length=180, blank=True, default='')

    class Meta:
        indexes = [
            models.Index(fields=('number_plate', 'expense_type')),
        ]

    def __str__(self) -> str:
        return f'{self.expense.voucher_number} - {self.number_plate}'


class CashBankTransaction(TimestampedModel, SoftDeleteModel):
    class TransactionType(models.TextChoices):
        DEPOSIT = 'deposit', 'Deposit'
        WITHDRAWAL = 'withdrawal', 'Withdrawal'

    class Currency(models.TextChoices):
        USD = 'USD', 'USD'
        AFN = 'AFN', 'AFN'

    transaction_type = models.CharField(max_length=16, choices=TransactionType.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, choices=Currency.choices)
    depositor_name = models.CharField(max_length=180, blank=True, default='')
    withdrawer_name = models.CharField(max_length=180, blank=True, default='')
    reason = models.TextField()
    slip = models.FileField(upload_to=cash_bank_slip_upload_path)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='cash_bank_transactions',
    )

    class Meta:
        ordering = ('-created_at', '-id')
        indexes = [
            models.Index(fields=('currency', 'transaction_type', 'created_at')),
        ]

    def __str__(self) -> str:
        return f'{self.get_transaction_type_display()} #{self.id}: {self.amount} {self.currency}'


class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = 'create', 'Create'
        UPDATE = 'update', 'Update'
        DELETE = 'delete', 'Delete'

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='audit_logs',
    )
    action = models.CharField(max_length=16, choices=Action.choices)
    resource = models.CharField(max_length=120)
    target_id = models.CharField(max_length=64, blank=True, default='')
    endpoint = models.CharField(max_length=255)
    status_code = models.PositiveSmallIntegerField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at', '-id')
        indexes = [
            models.Index(fields=('created_at',), name='audit_log_created_idx'),
            models.Index(fields=('actor', 'created_at'), name='audit_log_actor_created_idx'),
            models.Index(fields=('resource', 'created_at'), name='audit_log_resource_created_idx'),
        ]

    def __str__(self) -> str:
        target = f' #{self.target_id}' if self.target_id else ''
        return f'{self.get_action_display()} {self.resource}{target}'


class ExpenseCategory(TimestampedModel):
    title_dari = models.CharField(max_length=180, blank=True)
    title_pashto = models.CharField(max_length=180, blank=True)
    title_english = models.CharField(max_length=180, blank=True)

    class Meta:
        ordering = ('title_english', 'title_dari', 'title_pashto', 'id')
        verbose_name_plural = 'expense categories'

    @property
    def display_title(self) -> str:
        return self.title_english or self.title_dari or self.title_pashto or f'Category {self.id}'

    def __str__(self) -> str:
        return self.display_title


class ExpenseSubcategory(TimestampedModel):
    category = models.ForeignKey(ExpenseCategory, on_delete=models.CASCADE, related_name='subcategories')
    code = models.CharField(max_length=80, unique=True)
    title_dari = models.CharField(max_length=180, blank=True)
    title_pashto = models.CharField(max_length=180, blank=True)
    title_english = models.CharField(max_length=180, blank=True)

    class Meta:
        ordering = ('category__title_english', 'category__title_dari', 'category__title_pashto', 'code')
        verbose_name_plural = 'expense subcategories'

    @property
    def display_title(self) -> str:
        return self.title_english or self.title_dari or self.title_pashto or self.code

    def __str__(self) -> str:
        return f'{self.category}: {self.display_title}'


class ClinicalDocument(TimestampedModel, SoftDeleteModel):
    class DocumentType(models.TextChoices):
        PRESCRIPTION = 'prescription', 'Prescription'
        LAB_ORDER = 'lab_order', 'Laboratory order'
        LAB_BILL = 'lab_bill', 'Laboratory bill'
        MEDICINE_BILL = 'medicine_bill', 'Medicine bill'
        ULTRASOUND = 'ultrasound', 'Ultrasound'
        FAMILY_PLANNING = 'family_planning', 'Family planning'
        VACCINATION = 'vaccination', 'Vaccination'
        RUTF = 'rutf', 'RUTF'

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='documents')
    document_type = models.CharField(max_length=32, choices=DocumentType.choices)
    title = models.CharField(max_length=160)
    payload = models.JSONField(default=dict, blank=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    result_file = models.FileField(upload_to='laboratory/results/', blank=True)
    payment = models.OneToOneField(
        Payment,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='clinical_document',
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='clinical_documents')

    class Meta:
        ordering = ('-created_at',)
        indexes = (
            models.Index(fields=('document_type', 'created_at')),
        )

    def __str__(self) -> str:
        return f'{self.get_document_type_display()} - {self.patient}'


class Medicine(TimestampedModel, SoftDeleteModel):
    name = models.CharField(max_length=160, unique=True)
    unit = models.CharField(max_length=32, default='tablet')
    sale_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    current_stock = models.PositiveIntegerField(default=0)
    low_stock_threshold = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ('name',)

    def __str__(self) -> str:
        return self.name


class LabTest(TimestampedModel):
    name = models.CharField(max_length=160, unique=True)
    display_name = models.CharField(max_length=160, blank=True)
    category = models.CharField(max_length=80, blank=True)
    is_panel = models.BooleanField(default=False)
    parent_panel = models.ForeignKey('self', on_delete=models.CASCADE, related_name='components', null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    normal_range_from = models.CharField(max_length=80, blank=True)
    normal_range_to = models.CharField(max_length=80, blank=True)
    unit = models.CharField(max_length=40, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ('category', 'sort_order', 'name')

    def __str__(self) -> str:
        return self.display_name or self.name


class MedicineStockMovement(TimestampedModel):
    class MovementType(models.TextChoices):
        IN = 'in', 'Stock in'
        OUT = 'out', 'Stock out'
        ADJUSTMENT = 'adjustment', 'Adjustment'

    medicine = models.ForeignKey(Medicine, on_delete=models.CASCADE, related_name='stock_movements')
    movement_type = models.CharField(max_length=16, choices=MovementType.choices)
    quantity = models.PositiveIntegerField()
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='stock_movements')

    class Meta:
        ordering = ('-created_at',)

    def save(self, *args, **kwargs):
        creating = self.pk is None
        super().save(*args, **kwargs)
        if creating:
            medicine = self.medicine
            if self.movement_type == self.MovementType.IN:
                medicine.current_stock += self.quantity
            elif self.movement_type == self.MovementType.OUT:
                medicine.current_stock = max(0, medicine.current_stock - self.quantity)
            else:
                medicine.current_stock = self.quantity
            medicine.save(update_fields=['current_stock', 'updated_at'])


def website_page_image_upload_path(instance, filename: str) -> str:
    return f'website/pages/{instance.page}/{instance.language}/{filename}'


def website_logo_upload_path(instance, filename: str) -> str:
    return f'website/logo/{filename}'


def website_post_image_upload_path(instance, filename: str) -> str:
    return f'website/posts/{instance.post_id}/{filename}'


def website_gallery_image_upload_path(instance, filename: str) -> str:
    return f'website/gallery/{filename}'


def private_document_upload_path(instance, filename: str) -> str:
    return f'private-documents/{instance.category or "general"}/{filename}'


class WebsitePageContent(TimestampedModel):
    class Page(models.TextChoices):
        HOME = 'home', 'Home'
        ABOUT = 'about', 'About'
        MISSION = 'mission', 'Our mission'
        VISION = 'vision', 'Our vision'
        SERVICES = 'services', 'Services'
        CONTACT = 'contact', 'Contact'
        NEWS = 'news', 'News page'

    class Language(models.TextChoices):
        ENGLISH = 'en', 'English'
        DARI = 'fa', 'Dari'
        PASHTO = 'ps', 'Pashto'

    page = models.CharField(max_length=32, choices=Page.choices)
    language = models.CharField(max_length=2, choices=Language.choices)
    content = models.JSONField(default=dict, blank=True)
    image_url = models.CharField(max_length=500, blank=True)
    image_file = models.FileField(upload_to=website_page_image_upload_path, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='updated_website_pages',
    )

    class Meta:
        ordering = ('page', 'language')
        constraints = (
            models.UniqueConstraint(fields=('page', 'language'), name='unique_website_page_language'),
        )

    def __str__(self) -> str:
        return f'{self.get_page_display()} ({self.get_language_display()})'


class WebsiteSettings(TimestampedModel):
    logo_url = models.CharField(max_length=500, blank=True)
    logo_file = models.FileField(upload_to=website_logo_upload_path, blank=True)
    header_content = models.JSONField(default=dict, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='updated_website_settings',
    )

    class Meta:
        verbose_name_plural = 'website settings'

    def __str__(self) -> str:
        return 'Website settings'


class WebsitePost(TimestampedModel):
    title_en = models.CharField(max_length=240)
    title_fa = models.CharField(max_length=240)
    title_ps = models.CharField(max_length=240)
    content_en = models.TextField()
    content_fa = models.TextField()
    content_ps = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_website_posts',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='updated_website_posts',
    )

    class Meta:
        ordering = ('-created_at', '-id')

    def __str__(self) -> str:
        return self.title_en


class WebsitePostImage(TimestampedModel):
    post = models.ForeignKey(WebsitePost, on_delete=models.CASCADE, related_name='images')
    image = models.FileField(upload_to=website_post_image_upload_path)

    class Meta:
        ordering = ('created_at', 'id')


class WebsiteGalleryImage(TimestampedModel):
    image = models.FileField(upload_to=website_gallery_image_upload_path)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='uploaded_website_gallery_images',
    )

    class Meta:
        ordering = ('-created_at', '-id')


class PrivateDocument(TimestampedModel, SoftDeleteModel):
    title = models.CharField(max_length=180)
    category = models.CharField(max_length=120)
    file = models.FileField(upload_to=private_document_upload_path)
    max_size_mb = models.DecimalField(max_digits=6, decimal_places=2, default=1)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='private_documents',
    )

    class Meta:
        ordering = ('-created_at', 'title')

    def __str__(self) -> str:
        return f'{self.title} ({self.category})'
