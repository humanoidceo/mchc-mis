from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0044_websitesettings_social_links'),
    ]

    operations = [
        migrations.CreateModel(
            name='PaymentEmergencyService',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('service', models.CharField(choices=[('iv_injection', 'IV injection'), ('im_injection', 'IM injection'), ('iv_cannulation', 'IV canulation'), ('iv_fluid', 'IV Fluid'), ('dressing', 'Dressing'), ('suturing', 'Suturing'), ('check_bp', 'Check BP'), ('nebulization', 'Nebulization')], max_length=32)),
                ('price', models.DecimalField(decimal_places=2, max_digits=10)),
                ('payment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='emergency_service_items', to='clinic.payment')),
            ],
            options={'ordering': ('id',)},
        ),
        migrations.AddConstraint(
            model_name='paymentemergencyservice',
            constraint=models.UniqueConstraint(fields=('payment', 'service'), name='unique_payment_emergency_service'),
        ),
    ]
