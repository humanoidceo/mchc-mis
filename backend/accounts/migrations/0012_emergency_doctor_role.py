from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0011_employee_deleted_at_employee_deleted_by_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='staffprofile',
            name='role',
            field=models.CharField(
                choices=[
                    ('super_admin', 'Super admin'),
                    ('website_content_editor', 'Website content editor'),
                    ('receptionist', 'Receptionist'),
                    ('doctor', 'Doctor'),
                    ('emergency_doctor', 'Emergency Doctor'),
                    ('gynecologist', 'Gynecologist'),
                    ('laboratory', 'Laboratory'),
                    ('pharmacist', 'Pharmacist'),
                    ('midwife', 'Midwife'),
                    ('vaccinator', 'Vaccinator'),
                    ('malnutrition', 'Malnutrition'),
                ],
                max_length=32,
            ),
        ),
    ]
