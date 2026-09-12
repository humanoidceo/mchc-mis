from django.db import migrations, models


def backfill_expense_vouchers(apps, schema_editor):
    Expense = apps.get_model('clinic', 'Expense')
    ExpenseVoucherSequence = apps.get_model('clinic', 'ExpenseVoucherSequence')
    expenses = Expense._base_manager.all().order_by('id')
    batch = []
    last_number = 0

    # Use bounded batches because this project already has production expense data.
    for expense in expenses.iterator(chunk_size=1000):
        last_number += 1
        expense.voucher_number = f'VCH-{last_number:05d}'
        batch.append(expense)
        if len(batch) == 1000:
            Expense._base_manager.bulk_update(batch, ['voucher_number'], batch_size=1000)
            batch = []
    if batch:
        Expense._base_manager.bulk_update(batch, ['voucher_number'], batch_size=1000)

    ExpenseVoucherSequence.objects.update_or_create(pk=1, defaults={'last_number': last_number})


def clear_expense_vouchers(apps, schema_editor):
    Expense = apps.get_model('clinic', 'Expense')
    ExpenseVoucherSequence = apps.get_model('clinic', 'ExpenseVoucherSequence')
    Expense._base_manager.all().update(voucher_number=None)
    ExpenseVoucherSequence.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0025_expensecategory_multilingual_titles'),
    ]

    operations = [
        migrations.AddField(
            model_name='expense',
            name='voucher_number',
            field=models.CharField(blank=True, max_length=24, null=True),
        ),
        migrations.AddField(
            model_name='expense',
            name='payment_method',
            field=models.CharField(choices=[('cash', 'Cash'), ('bank_transfer', 'Bank transfer'), ('cheque', 'Cheque')], default='cash', max_length=20),
        ),
        migrations.AddField(
            model_name='expense',
            name='bank_name',
            field=models.CharField(blank=True, default='', max_length=180),
        ),
        migrations.AddField(
            model_name='expense',
            name='bank_account',
            field=models.CharField(blank=True, default='', max_length=180),
        ),
        migrations.AddField(
            model_name='expense',
            name='transfer_reference_number',
            field=models.CharField(blank=True, default='', max_length=180),
        ),
        migrations.AddField(
            model_name='expense',
            name='transfer_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='expense',
            name='cheque_number',
            field=models.CharField(blank=True, default='', max_length=180),
        ),
        migrations.AddField(
            model_name='expense',
            name='cheque_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='expense',
            name='cheque_status',
            field=models.CharField(choices=[('pending', 'Pending'), ('cleared', 'Cleared'), ('bounced', 'Bounced'), ('cancelled', 'Cancelled')], default='pending', max_length=20),
        ),
        migrations.AddField(
            model_name='expense',
            name='paid_to_received_from',
            field=models.CharField(blank=True, default='', max_length=180),
        ),
        migrations.AddField(
            model_name='expense',
            name='funding_source',
            field=models.CharField(blank=True, default='', max_length=180),
        ),
        migrations.AddField(
            model_name='expense',
            name='project_activity',
            field=models.CharField(blank=True, default='', max_length=180),
        ),
        migrations.AddField(
            model_name='expense',
            name='department',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.CreateModel(
            name='ExpenseVoucherSequence',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('last_number', models.PositiveBigIntegerField(default=0)),
            ],
        ),
        migrations.RunPython(backfill_expense_vouchers, clear_expense_vouchers),
        migrations.AlterField(
            model_name='expense',
            name='voucher_number',
            field=models.CharField(max_length=24, unique=True),
        ),
    ]
