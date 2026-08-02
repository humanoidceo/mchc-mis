from decimal import Decimal, ROUND_CEILING

from django.db import migrations


def round_up_sell_prices_to_tens(apps, schema_editor):
    Medicine = apps.get_model("pharmacy", "Medicine")
    for medicine in Medicine.objects.all().iterator():
        price = medicine.buy_price + (medicine.buy_price * medicine.profit_percentage / Decimal("100"))
        medicine.sell_price = (price / Decimal("10")).quantize(Decimal("1"), rounding=ROUND_CEILING) * Decimal("10")
        medicine.save(update_fields=["sell_price", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [
        ("pharmacy", "0011_medicine_deleted_at_medicine_deleted_by_and_more"),
    ]

    operations = [
        migrations.RunPython(round_up_sell_prices_to_tens, migrations.RunPython.noop),
    ]
