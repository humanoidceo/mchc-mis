from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('clinic', '0009_expense'),
    ]

    operations = [
        migrations.AddField(
            model_name='expense',
            name='amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
    ]
