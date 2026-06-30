from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='patient',
            name='age',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='payment',
            name='department',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='payment',
            name='doctor_name',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='payment',
            name='patient_age',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='payment',
            name='doctor_fee',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name='payment',
            name='payment_type',
            field=models.CharField(choices=[('full', 'Full payment'), ('free', 'Free'), ('discount', 'Discount')], default='full', max_length=16),
        ),
        migrations.AddField(
            model_name='payment',
            name='discount_percentage',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=5),
        ),
        migrations.AddField(
            model_name='payment',
            name='discount_amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
    ]
