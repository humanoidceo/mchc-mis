from decimal import Decimal, ROUND_CEILING

from django.db import migrations


def round_up_sell_prices(apps, schema_editor):
    Medicine = apps.get_model("pharmacy", "Medicine")
    for medicine in Medicine.objects.all():
        price = medicine.buy_price + (medicine.buy_price * medicine.profit_percentage / Decimal("100"))
        medicine.sell_price = price.quantize(Decimal("1"), rounding=ROUND_CEILING)
        medicine.save(update_fields=["sell_price", "updated_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0003_medicine_country_of_product_medicine_expiry_date_and_more"),
    ]

    operations = [
        migrations.RunPython(round_up_sell_prices, migrations.RunPython.noop),
    ]
