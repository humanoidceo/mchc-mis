from django.db import migrations


def add_midwife_document_permissions(apps, schema_editor):
    StaffProfile = apps.get_model('accounts', 'StaffProfile')
    for profile in StaffProfile.objects.filter(role='midwife').iterator():
        permissions = list(profile.allowed_permissions or [])
        changed = False
        for code in ['documents.prescription.create', 'documents.lab_order.create']:
            if code not in permissions:
                permissions.append(code)
                changed = True
        if changed:
            profile.allowed_permissions = permissions
            profile.save(update_fields=['allowed_permissions', 'updated_at'])


def remove_midwife_document_permissions(apps, schema_editor):
    StaffProfile = apps.get_model('accounts', 'StaffProfile')
    for profile in StaffProfile.objects.filter(role='midwife').iterator():
        permissions = [code for code in list(profile.allowed_permissions or []) if code not in {'documents.prescription.create', 'documents.lab_order.create'}]
        if permissions != list(profile.allowed_permissions or []):
            profile.allowed_permissions = permissions
            profile.save(update_fields=['allowed_permissions', 'updated_at'])


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0006_family_planning_permission'),
    ]

    operations = [
        migrations.RunPython(add_midwife_document_permissions, remove_midwife_document_permissions),
    ]
