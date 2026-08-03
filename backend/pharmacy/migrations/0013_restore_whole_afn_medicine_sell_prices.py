from decimal import Decimal, ROUND_CEILING

from django.db import migrations


def restore_whole_afn_sell_prices(apps, schema_editor):
    Medicine = apps.get_model("pharmacy", "Medicine")
    for medicine in Medicine.objects.all().iterator():
        price = medicine.buy_price + (medicine.buy_price * medicine.profit_percentage / Decimal("100"))
        medicine.sell_price = price.quantize(Decimal("1"), rounding=ROUND_CEILING)
        medicine.save(update_fields=["sell_price", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [
        ("pharmacy", "0012_round_up_medicine_sell_prices_to_tens"),
    ]

    operations = [
        migrations.RunPython(restore_whole_afn_sell_prices, migrations.RunPython.noop),
    ]
