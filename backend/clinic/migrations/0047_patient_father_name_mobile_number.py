from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0046_expense_old_expense_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='patient',
            name='father_name',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='patient',
            name='mobile_number',
            field=models.CharField(blank=True, default='', max_length=32),
        ),
    ]
