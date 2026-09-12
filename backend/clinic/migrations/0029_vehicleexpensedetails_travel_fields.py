from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0028_vehicleexpensedetails_driver_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='vehicleexpensedetails',
            name='destination',
            field=models.CharField(blank=True, default='', max_length=180),
        ),
        migrations.AddField(
            model_name='vehicleexpensedetails',
            name='source',
            field=models.CharField(blank=True, default='', max_length=180),
        ),
        migrations.AddField(
            model_name='vehicleexpensedetails',
            name='travel_purpose',
            field=models.TextField(blank=True, default=''),
        ),
    ]
