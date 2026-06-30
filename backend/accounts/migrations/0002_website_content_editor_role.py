from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
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
