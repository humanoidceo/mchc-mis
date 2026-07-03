from django.db import migrations


def add_family_planning_permission(apps, schema_editor):
    StaffProfile = apps.get_model('accounts', 'StaffProfile')
    for profile in StaffProfile.objects.filter(role__in=['gynecologist', 'midwife', 'super_admin']).iterator():
        permissions = list(profile.allowed_permissions or [])
        if 'documents.family_planning.create' not in permissions:
            permissions.append('documents.family_planning.create')
            profile.allowed_permissions = permissions
            profile.save(update_fields=['allowed_permissions', 'updated_at'])


def remove_family_planning_permission(apps, schema_editor):
    StaffProfile = apps.get_model('accounts', 'StaffProfile')
    for profile in StaffProfile.objects.iterator():
        permissions = [code for code in list(profile.allowed_permissions or []) if code != 'documents.family_planning.create']
        if permissions != list(profile.allowed_permissions or []):
            profile.allowed_permissions = permissions
            profile.save(update_fields=['allowed_permissions', 'updated_at'])


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0005_gynecologist_role'),
    ]

    operations = [
        migrations.RunPython(add_family_planning_permission, remove_family_planning_permission),
    ]
