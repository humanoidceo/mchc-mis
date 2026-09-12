from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0030_cashbanktransaction'),
    ]

    operations = [
        migrations.AddField(
            model_name='cashbanktransaction',
            name='depositor_name',
            field=models.CharField(blank=True, default='', max_length=180),
        ),
        migrations.AddField(
            model_name='cashbanktransaction',
            name='withdrawer_name',
            field=models.CharField(blank=True, default='', max_length=180),
        ),
    ]
