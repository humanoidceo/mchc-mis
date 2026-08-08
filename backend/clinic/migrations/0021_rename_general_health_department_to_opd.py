from django.db import migrations


def rename_general_health_department_to_opd(apps, schema_editor):
    Payment = apps.get_model('clinic', 'Payment')
    Payment.objects.filter(department__iexact='General health').update(department='OPD')


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0020_rename_care_departments'),
    ]

    operations = [
        migrations.RunPython(rename_general_health_department_to_opd, migrations.RunPython.noop),
    ]
