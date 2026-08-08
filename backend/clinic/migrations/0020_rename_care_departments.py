from django.db import migrations


def rename_care_departments(apps, schema_editor):
    Payment = apps.get_model('clinic', 'Payment')
    Payment.objects.filter(department__iexact='Maternal care').update(department='Midwifery')
    Payment.objects.filter(department__iexact='Child care').update(department='Pediatrics')


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0019_expense_name_optional'),
    ]

    operations = [
        migrations.RunPython(rename_care_departments, migrations.RunPython.noop),
    ]
