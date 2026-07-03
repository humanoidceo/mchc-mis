from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0004_round_up_medicine_sell_prices"),
    ]

    operations = [
        migrations.AlterField(
            model_name="saleitem",
            name="medicine",
            field=models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, to="pharmacy.medicine"),
        ),
    ]
