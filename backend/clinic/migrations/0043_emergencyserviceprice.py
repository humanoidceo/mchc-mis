from django.db import migrations, models


EMERGENCY_SERVICES = (
    ('iv_injection', 'IV injection'),
    ('im_injection', 'IM injection'),
    ('iv_cannulation', 'IV canulation'),
    ('iv_fluid', 'IV Fluid'),
    ('dressing', 'Dressing'),
    ('suturing', 'Suturing'),
    ('check_bp', 'Check BP'),
    ('nebulization', 'Nebulization'),
)


def seed_emergency_service_prices(apps, schema_editor):
    EmergencyServicePrice = apps.get_model('clinic', 'EmergencyServicePrice')
    for service, _label in EMERGENCY_SERVICES:
        EmergencyServicePrice.objects.get_or_create(service=service, defaults={'price': 0})


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0042_payment_emergency_service_fee'),
    ]

    operations = [
        migrations.CreateModel(
            name='EmergencyServicePrice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('service', models.CharField(choices=EMERGENCY_SERVICES, max_length=32, unique=True)),
                ('price', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
            ],
            options={'ordering': ('service',)},
        ),
        migrations.RunPython(seed_emergency_service_prices, migrations.RunPython.noop),
    ]
