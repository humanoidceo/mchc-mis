from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0041_payment_emergency_service'),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='emergency_service_fee',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
    ]
