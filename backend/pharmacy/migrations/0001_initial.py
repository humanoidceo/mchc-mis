# Generated for MCHC-MIS pharmacy module.

import decimal
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PharmacySetting",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("pharmacy_name", models.CharField(default="MCHC Pharmacy", max_length=180)),
                ("phone", models.CharField(blank=True, max_length=50)),
                ("address", models.CharField(blank=True, max_length=255)),
                (
                    "default_profit_percentage",
                    models.DecimalField(
                        decimal_places=2,
                        default=decimal.Decimal("20.00"),
                        help_text="Default profit percentage added to buy price.",
                        max_digits=5,
                    ),
                ),
                (
                    "pharmacist",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pharmacy_setting",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Pharmacy Setting",
                "verbose_name_plural": "Pharmacy Settings",
            },
        ),
        migrations.CreateModel(
            name="Medicine",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=180)),
                ("generic_name", models.CharField(blank=True, max_length=180)),
                ("quantity", models.DecimalField(max_digits=10, decimal_places=1)),
                ("buy_price", models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    "profit_percentage",
                    models.DecimalField(
                        decimal_places=2,
                        default=decimal.Decimal("20.00"),
                        help_text="Profit percentage for this medicine.",
                        max_digits=5,
                    ),
                ),
                (
                    "sell_price",
                    models.DecimalField(
                        decimal_places=2,
                        editable=False,
                        help_text="Automatically calculated from buy price + profit percentage.",
                        max_digits=12,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "pharmacist",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="medicines",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="Sale",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("bill_no", models.CharField(blank=True, max_length=40, unique=True)),
                ("customer_name", models.CharField(blank=True, max_length=180)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "pharmacist",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="pharmacy_sales",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="SaleItem",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("medicine_name", models.CharField(max_length=180)),
                ("generic_name", models.CharField(blank=True, max_length=180)),
                ("quantity", models.DecimalField(decimal_places=2, max_digits=12)),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    "medicine",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        to="pharmacy.medicine",
                    ),
                ),
                (
                    "sale",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="pharmacy.sale",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="medicine",
            constraint=models.UniqueConstraint(
                fields=("pharmacist", "name", "generic_name"),
                name="unique_medicine_per_pharmacist",
            ),
        ),
    ]
