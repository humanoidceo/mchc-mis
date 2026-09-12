from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import clinic.models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0029_vehicleexpensedetails_travel_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CashBankTransaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('deleted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='deleted_%(app_label)s_%(class)ss', to=settings.AUTH_USER_MODEL)),
                ('transaction_type', models.CharField(choices=[('deposit', 'Deposit'), ('withdrawal', 'Withdrawal')], max_length=16)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14)),
                ('currency', models.CharField(choices=[('USD', 'USD'), ('AFN', 'AFN')], max_length=3)),
                ('reason', models.TextField()),
                ('slip', models.FileField(upload_to=clinic.models.cash_bank_slip_upload_path)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='cash_bank_transactions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ('-created_at', '-id'),
            },
        ),
        migrations.AddIndex(
            model_name='cashbanktransaction',
            index=models.Index(fields=['currency', 'transaction_type', 'created_at'], name='clinic_cash_currenc_0a0340_idx'),
        ),
    ]
