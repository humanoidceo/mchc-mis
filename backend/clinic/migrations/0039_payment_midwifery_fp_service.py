# Generated manually for the production-safe Midwifery FP sub-service field.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0038_alter_websitepagecontent_page'),
    ]

    operations = [
        migrations.AlterField(
            model_name='payment',
            name='midwifery_service',
            field=models.CharField(
                blank=True,
                choices=[
                    ('anc', 'ANC'),
                    ('pnc', 'PNC'),
                    ('normal_delivery', 'Normal delivery'),
                    ('fp', 'FP'),
                ],
                default='',
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name='payment',
            name='midwifery_fp_service',
            field=models.CharField(
                blank=True,
                choices=[
                    ('fp', 'FP'),
                    ('iud_insertion', 'Insertion of IUD'),
                    ('iud_removal', 'Removal of IUD'),
                    ('implant', 'Implant'),
                    ('capsule_insertion', 'Insertion of capsule'),
                    ('capsule_removal', 'Removal of capsule'),
                ],
                default='',
                max_length=32,
            ),
        ),
    ]
