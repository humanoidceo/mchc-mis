from django.db import migrations


def set_midwife_billing_department(apps, schema_editor):
    Payment = apps.get_model('clinic', 'Payment')
    Payment.objects.filter(
        department='Midwife billing',
        notes__startswith='Midwife procedure:',
    ).update(department='Maternal care')


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0016_round_up_existing_payment_final_amounts'),
    ]

    operations = [
        migrations.RunPython(set_midwife_billing_department, migrations.RunPython.noop),
    ]
