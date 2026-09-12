from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0033_auditlog'),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='midwifery_service',
            field=models.CharField(
                blank=True,
                choices=[
                    ('iud_insertion', 'Insertion of IUD'),
                    ('iud_removal', 'Removal of IUD'),
                    ('implant_insertion', 'Insertion of implant'),
                    ('implant_removal', 'Removal of implant'),
                    ('coc_tablet', 'COC tablet'),
                    ('pop_tablet', 'POP tablet'),
                    ('condom', 'Condom'),
                    ('dmpa', 'DMPA'),
                    ('emergency_tablets', 'Emergency Tablets'),
                    ('delivery', 'Delivery'),
                ],
                default='',
                max_length=32,
            ),
        ),
    ]
