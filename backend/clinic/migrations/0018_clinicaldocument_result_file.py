from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0017_set_midwife_billing_department_to_maternal_care'),
    ]

    operations = [
        migrations.AddField(
            model_name='clinicaldocument',
            name='result_file',
            field=models.FileField(blank=True, upload_to='laboratory/results/'),
        ),
    ]
