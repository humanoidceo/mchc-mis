from decimal import Decimal, ROUND_CEILING

from django.db import migrations


def sync_medicine_profit_with_settings(apps, schema_editor):
    Medicine = apps.get_model("pharmacy", "Medicine")
    PharmacySetting = apps.get_model("pharmacy", "PharmacySetting")

    settings_by_pharmacist = {
        setting.pharmacist_id: setting.default_profit_percentage
        for setting in PharmacySetting.objects.all()
    }

    for medicine in Medicine.objects.all():
        default_profit_percentage = settings_by_pharmacist.get(medicine.pharmacist_id)
        if default_profit_percentage is None:
            continue
        medicine.profit_percentage = default_profit_percentage
        price = medicine.buy_price + (medicine.buy_price * default_profit_percentage / Decimal("100"))
        medicine.sell_price = price.quantize(Decimal("1"), rounding=ROUND_CEILING)
        medicine.save(update_fields=["profit_percentage", "sell_price", "updated_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0005_allow_deleted_medicine_on_sale_items"),
    ]

    operations = [
        migrations.RunPython(sync_medicine_profit_with_settings, migrations.RunPython.noop),
    ]
