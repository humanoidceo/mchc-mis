from django.db import migrations
from django.db.models import Q


def move_salary_expenses_to_e05(apps, schema_editor):
    Expense = apps.get_model('clinic', 'Expense')
    # Only salary-linked records are moved; ordinary historical expenses are untouched.
    Expense._base_manager.filter(
        Q(salary_payment__isnull=False) | Q(salary_advance__isnull=False)
    ).exclude(category='E-05').update(category='E-05')


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0031_cashbanktransaction_party_names'),
    ]

    operations = [
        migrations.RunPython(move_salary_expenses_to_e05, migrations.RunPython.noop),
    ]
