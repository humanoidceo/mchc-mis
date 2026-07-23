from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0013_privatedocument'),
    ]

    operations = [
        migrations.AddField(
            model_name='patient',
            name='age_unit',
            field=models.CharField(
                choices=[('month', 'Month'), ('year', 'Year')],
                default='year',
                max_length=8,
            ),
        ),
        migrations.AddField(
            model_name='payment',
            name='patient_age_unit',
            field=models.CharField(
                choices=[('month', 'Month'), ('year', 'Year')],
                default='year',
                max_length=8,
            ),
        ),
    ]
