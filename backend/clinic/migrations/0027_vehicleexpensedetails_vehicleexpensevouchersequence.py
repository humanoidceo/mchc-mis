from django.db import migrations, models
import django.db.models.deletion


def create_vehicle_voucher_sequence(apps, schema_editor):
    apps.get_model('clinic', 'VehicleExpenseVoucherSequence').objects.get_or_create(pk=1)


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0026_expense_voucher_and_payment_details'),
    ]

    operations = [
        migrations.CreateModel(
            name='VehicleExpenseVoucherSequence',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('last_number', models.PositiveBigIntegerField(default=0)),
            ],
        ),
        migrations.CreateModel(
            name='VehicleExpenseDetails',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('number_plate', models.CharField(max_length=64)),
                ('expense_type', models.CharField(choices=[('fuel', 'Fuel'), ('maintenance', 'Vehicle maintenance')], max_length=20)),
                ('fuel_type', models.CharField(blank=True, choices=[('diesel', 'Diesel'), ('petrol', 'Petrol'), ('gas', 'Gas')], default='', max_length=16)),
                ('quantity_liters', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('price_per_liter', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('vehicle_odometer_km', models.PositiveBigIntegerField()),
                ('fuel_station_supplier', models.CharField(blank=True, default='', max_length=180)),
                ('invoice_number', models.CharField(blank=True, default='', max_length=180)),
                ('workshop', models.CharField(blank=True, default='', max_length=180)),
                ('expense', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='vehicle_details', to='clinic.expense')),
            ],
        ),
        migrations.AddIndex(
            model_name='vehicleexpensedetails',
            index=models.Index(fields=['number_plate', 'expense_type'], name='clinic_vehi_number__ad8360_idx'),
        ),
        migrations.RunPython(
            create_vehicle_voucher_sequence,
            migrations.RunPython.noop,
        ),
    ]
