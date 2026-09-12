from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0027_vehicleexpensedetails_vehicleexpensevouchersequence'),
    ]

    operations = [
        migrations.AddField(
            model_name='vehicleexpensedetails',
            name='driver_name',
            field=models.CharField(blank=True, default='', max_length=180),
        ),
    ]
