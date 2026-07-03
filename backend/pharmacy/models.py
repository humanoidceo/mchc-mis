from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP

from django.conf import settings
from django.db import models
from django.utils import timezone

from clinic.models import ClinicalDocument, Patient, Payment


def money(value):
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def whole_money_up(value):
    return Decimal(value).quantize(Decimal("1"), rounding=ROUND_CEILING)


def pharmacy_default_profit_percentage(pharmacist):
    if pharmacist is None:
        return None
    return (
        PharmacySetting.objects
        .filter(pharmacist=pharmacist)
        .values_list("default_profit_percentage", flat=True)
        .first()
    )


class PharmacySetting(models.Model):
    pharmacist = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pharmacy_setting",
    )
    pharmacy_name = models.CharField(max_length=180, default="MCHC Pharmacy")
    phone = models.CharField(max_length=50, blank=True)
    address = models.CharField(max_length=255, blank=True)
    default_profit_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("20.00"),
        help_text="Default profit percentage added to buy price.",
    )

    class Meta:
        verbose_name = "Pharmacy Setting"
        verbose_name_plural = "Pharmacy Settings"

    def __str__(self):
        return f"{self.pharmacy_name} - {self.pharmacist}"


class Medicine(models.Model):
    pharmacist = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="medicines",
    )
    name = models.CharField(max_length=180)
    generic_name = models.CharField(max_length=180, blank=True)
    country_of_product = models.CharField(max_length=120, blank=True)
    production_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    quantity = models.PositiveIntegerField(default=0)
    buy_price = models.DecimalField(max_digits=12, decimal_places=2)
    profit_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("20.00"),
        help_text="Profit percentage for this medicine.",
    )
    sell_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        editable=False,
        help_text="Automatically calculated from buy price + profit percentage.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["pharmacist", "name", "generic_name"],
                name="unique_medicine_per_pharmacist",
            )
        ]

    def calculate_sell_price(self):
        default_profit_percentage = pharmacy_default_profit_percentage(self.pharmacist)
        if default_profit_percentage is not None:
            self.profit_percentage = default_profit_percentage
        price = self.buy_price + (self.buy_price * self.profit_percentage / Decimal("100"))
        return whole_money_up(price)

    def save(self, *args, **kwargs):
        self.sell_price = self.calculate_sell_price()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


def sync_medicine_profit_percentages(pharmacist):
    default_profit_percentage = pharmacy_default_profit_percentage(pharmacist)
    if default_profit_percentage is None:
        return

    for medicine in Medicine.objects.filter(pharmacist=pharmacist).iterator():
        medicine.profit_percentage = default_profit_percentage
        medicine.save(update_fields=["profit_percentage", "sell_price", "updated_at"])


class Sale(models.Model):
    class CustomerType(models.TextChoices):
        INTERNAL = "internal", "Internal"
        EXTERNAL = "external", "External"

    pharmacist = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pharmacy_sales",
    )
    customer_type = models.CharField(
        max_length=16,
        choices=CustomerType.choices,
        default=CustomerType.EXTERNAL,
    )
    patient = models.ForeignKey(
        Patient,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="pharmacy_sales",
    )
    prescription_document = models.ForeignKey(
        ClinicalDocument,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="pharmacy_sales",
    )
    payment = models.OneToOneField(
        Payment,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="pharmacy_sale",
    )
    bill_no = models.CharField(max_length=40, unique=True, blank=True)
    customer_name = models.CharField(max_length=180, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.bill_no:
            stamp = timezone.now().strftime("%Y%m%d%H%M%S")
            self.bill_no = f"PH-{stamp}-{self.pharmacist_id}"
        super().save(*args, **kwargs)

    @property
    def total_amount(self):
        return sum((item.total_price for item in self.items.all()), Decimal("0.00"))

    def __str__(self):
        return self.bill_no


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    medicine = models.ForeignKey(Medicine, null=True, blank=True, on_delete=models.SET_NULL)

    # Snapshot fields keep old bills correct even if medicine data changes later.
    medicine_name = models.CharField(max_length=180)
    generic_name = models.CharField(max_length=180, blank=True)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    @property
    def total_price(self):
        return money(self.quantity * self.unit_price)

    def save(self, *args, **kwargs):
        if self.medicine and not self.medicine_name:
            self.medicine_name = self.medicine.name
            self.generic_name = self.medicine.generic_name
            self.unit_price = self.medicine.sell_price
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.medicine_name} x {self.quantity}"
