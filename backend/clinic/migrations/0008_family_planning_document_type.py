from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('clinic', '0007_labtest_panels'),
    ]

    operations = [
        migrations.AlterField(
            model_name='clinicaldocument',
            name='document_type',
            field=models.CharField(
                choices=[
                    ('prescription', 'Prescription'),
                    ('lab_order', 'Laboratory order'),
                    ('lab_bill', 'Laboratory bill'),
                    ('medicine_bill', 'Medicine bill'),
                    ('ultrasound', 'Ultrasound'),
                    ('family_planning', 'Family planning'),
                    ('vaccination', 'Vaccination'),
                    ('rutf', 'RUTF'),
                ],
                max_length=32,
            ),
        ),
    ]
