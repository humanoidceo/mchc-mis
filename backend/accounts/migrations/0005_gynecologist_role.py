from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_employee_manage_permission'),
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
