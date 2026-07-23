from django.db import migrations


def add_private_document_permissions(apps, schema_editor):
    StaffProfile = apps.get_model('accounts', 'StaffProfile')
    for profile in StaffProfile.objects.filter(role__in=['super_admin', 'receptionist']).iterator():
        permissions = list(profile.allowed_permissions or [])
        if 'private_documents.manage' not in permissions:
            permissions.append('private_documents.manage')
            profile.allowed_permissions = permissions
            profile.save(update_fields=['allowed_permissions', 'updated_at'])


def remove_private_document_permissions(apps, schema_editor):
    StaffProfile = apps.get_model('accounts', 'StaffProfile')
    for profile in StaffProfile.objects.filter(role__in=['super_admin', 'receptionist']).iterator():
        permissions = [code for code in list(profile.allowed_permissions or []) if code != 'private_documents.manage']
        if permissions != list(profile.allowed_permissions or []):
            profile.allowed_permissions = permissions
            profile.save(update_fields=['allowed_permissions', 'updated_at'])


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0008_expenses_manage_permission'),
    ]

    operations = [
        migrations.RunPython(add_private_document_permissions, remove_private_document_permissions),
    ]
