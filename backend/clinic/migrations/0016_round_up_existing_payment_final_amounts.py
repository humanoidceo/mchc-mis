from decimal import Decimal, ROUND_CEILING

from django.db import migrations


def round_up_existing_payment_amounts(apps, schema_editor):
    Payment = apps.get_model('clinic', 'Payment')

    for payment in Payment.objects.all().iterator():
        amount = payment.amount or Decimal('0.00')
        if amount <= 0:
            rounded_amount = Decimal('0.00')
        else:
            rounded_amount = (
                (amount / Decimal('10')).quantize(Decimal('1'), rounding=ROUND_CEILING)
                * Decimal('10')
            )

        if payment.amount != rounded_amount:
            payment.amount = rounded_amount
            payment.save(update_fields=['amount'])


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0015_clinicaldocument_deleted_at_and_more'),
    ]

    operations = [
        migrations.RunPython(round_up_existing_payment_amounts, migrations.RunPython.noop),
    ]
