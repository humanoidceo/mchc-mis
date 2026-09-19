from django.db import migrations


def rename_opd_department_to_internal_medicines(apps, schema_editor):
    """Preserve the existing clinical history while changing its department label."""
    Payment = apps.get_model('clinic', 'Payment')
    DoctorDepartmentAssignment = apps.get_model('clinic', 'DoctorDepartmentAssignment')

    Payment.objects.filter(department__iexact='OPD').update(department='Internal Medicines')
    DoctorDepartmentAssignment.objects.filter(department__iexact='OPD').update(department='Internal Medicines')


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0039_payment_midwifery_fp_service'),
    ]

    operations = [
        migrations.RunPython(rename_opd_department_to_internal_medicines, migrations.RunPython.noop),
    ]
