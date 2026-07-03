from django.db import migrations


def add_expense_permissions(apps, schema_editor):
    StaffProfile = apps.get_model('accounts', 'StaffProfile')
    for profile in StaffProfile.objects.filter(role__in=['super_admin', 'receptionist']).iterator():
        permissions = list(profile.allowed_permissions or [])
        if 'expenses.manage' not in permissions:
            permissions.append('expenses.manage')
            profile.allowed_permissions = permissions
            profile.save(update_fields=['allowed_permissions', 'updated_at'])


def remove_expense_permissions(apps, schema_editor):
    StaffProfile = apps.get_model('accounts', 'StaffProfile')
    for profile in StaffProfile.objects.filter(role__in=['super_admin', 'receptionist']).iterator():
        permissions = [code for code in list(profile.allowed_permissions or []) if code != 'expenses.manage']
        if permissions != list(profile.allowed_permissions or []):
            profile.allowed_permissions = permissions
            profile.save(update_fields=['allowed_permissions', 'updated_at'])


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0007_midwife_doctor_document_permissions'),
    ]

    operations = [
        migrations.RunPython(add_expense_permissions, remove_expense_permissions),
    ]
