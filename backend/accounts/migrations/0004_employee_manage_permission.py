from django.db import migrations


def add_employee_manage_permission(apps, schema_editor):
    StaffProfile = apps.get_model('accounts', 'StaffProfile')
    for profile in StaffProfile.objects.filter(role='receptionist'):
        permissions = list(profile.allowed_permissions or [])
        if 'employees.manage' not in permissions:
            permissions.append('employees.manage')
            profile.allowed_permissions = permissions
            profile.save(update_fields=['allowed_permissions', 'updated_at'])


def remove_employee_manage_permission(apps, schema_editor):
    StaffProfile = apps.get_model('accounts', 'StaffProfile')
    for profile in StaffProfile.objects.filter(role='receptionist'):
        permissions = [code for code in list(profile.allowed_permissions or []) if code != 'employees.manage']
        profile.allowed_permissions = permissions
        profile.save(update_fields=['allowed_permissions', 'updated_at'])


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_employee'),
    ]

    operations = [
        migrations.RunPython(add_employee_manage_permission, remove_employee_manage_permission),
    ]
