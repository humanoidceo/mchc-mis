from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0040_rename_opd_department_to_internal_medicines'),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='emergency_service',
            field=models.CharField(
                blank=True,
                choices=[
                    ('iv_injection', 'IV injection'),
                    ('im_injection', 'IM injection'),
                    ('iv_cannulation', 'IV canulation'),
                    ('iv_fluid', 'IV Fluid'),
                    ('dressing', 'Dressing'),
                    ('suturing', 'Suturing'),
                    ('check_bp', 'Check BP'),
                    ('nebulization', 'Nebulization'),
                ],
                default='',
                max_length=32,
            ),
        ),
    ]
