from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0045_paymentemergencyservice'),
    ]

    operations = [
        migrations.AddField(
            model_name='expense',
            name='expense_date',
            field=models.DateField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name='expense',
            name='is_old_expense',
            field=models.BooleanField(default=False),
        ),
    ]
