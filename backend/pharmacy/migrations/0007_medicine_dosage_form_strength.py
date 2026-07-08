from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0006_sync_medicine_profit_with_settings"),
    ]

    operations = [
        migrations.AddField(
            model_name="medicine",
            name="dosage_form",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="medicine",
            name="strength",
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
