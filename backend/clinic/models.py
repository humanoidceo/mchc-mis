from django.conf import settings
from django.db import models


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Patient(TimestampedModel):
    class Gender(models.TextChoices):
        FEMALE = 'female', 'Female'
        MALE = 'male', 'Male'
        OTHER = 'other', 'Other'

    registration_number = models.CharField(max_length=32, unique=True)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80, blank=True)
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


class Payment(TimestampedModel):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='payments')
    service = models.CharField(max_length=120)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='created_payments')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name='approved_payments')
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-created_at',)


class ClinicalDocument(TimestampedModel):
    class DocumentType(models.TextChoices):
        PRESCRIPTION = 'prescription', 'Prescription'
        LAB_ORDER = 'lab_order', 'Laboratory order'
        LAB_BILL = 'lab_bill', 'Laboratory bill'
        MEDICINE_BILL = 'medicine_bill', 'Medicine bill'
        ULTRASOUND = 'ultrasound', 'Ultrasound'
        VACCINATION = 'vaccination', 'Vaccination'
        RUTF = 'rutf', 'RUTF'

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='documents')
    document_type = models.CharField(max_length=32, choices=DocumentType.choices)
    title = models.CharField(max_length=160)
    payload = models.JSONField(default=dict, blank=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='clinical_documents')

    class Meta:
        ordering = ('-created_at',)
        indexes = (
            models.Index(fields=('document_type', 'created_at')),
        )

    def __str__(self) -> str:
        return f'{self.get_document_type_display()} - {self.patient}'


class Medicine(TimestampedModel):
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
