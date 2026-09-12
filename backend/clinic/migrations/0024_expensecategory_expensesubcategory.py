from django.db import migrations, models
import django.db.models.deletion
from django.utils.text import slugify


LEGACY_EXPENSE_CATEGORIES = [
    'Car fuel',
    'Misc (motafariqa)',
    'fixings',
    'educational classes expenses',
    'Fuels (mahroqat)',
    'tax',
    'safayi',
    'washing materials',
    'Garbage transfer',
    'salary',
    'transport',
    'advertiments',
    'stationery',
    'laboratory equipments',
    'equipments',
    'electricity',
    'internet',
    'mobile credit',
    'building rent',
    'water',
    'Subsistence(eaasha)',
    'supplies (azoqa)',
]


def create_legacy_expense_subcategories(apps, schema_editor):
    Expense = apps.get_model('clinic', 'Expense')
    ExpenseCategory = apps.get_model('clinic', 'ExpenseCategory')
    ExpenseSubcategory = apps.get_model('clinic', 'ExpenseSubcategory')
    category, _created = ExpenseCategory.objects.get_or_create(title='General expenses')

    for legacy_title in LEGACY_EXPENSE_CATEGORIES:
        code = slugify(legacy_title)
        ExpenseSubcategory.objects.get_or_create(
            code=code,
            defaults={
                'category': category,
                'title_english': legacy_title,
            },
        )
        Expense.objects.filter(category=legacy_title).update(category=code)


def remove_legacy_expense_subcategories(apps, schema_editor):
    Expense = apps.get_model('clinic', 'Expense')
    ExpenseSubcategory = apps.get_model('clinic', 'ExpenseSubcategory')
    for legacy_title in LEGACY_EXPENSE_CATEGORIES:
        code = slugify(legacy_title)
        Expense.objects.filter(category=code).update(category=legacy_title)
    ExpenseSubcategory.objects.filter(code__in=[slugify(title) for title in LEGACY_EXPENSE_CATEGORIES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0023_allow_multiple_doctor_department_assignments'),
    ]

    operations = [
        migrations.CreateModel(
            name='ExpenseCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=180)),
            ],
            options={
                'verbose_name_plural': 'expense categories',
                'ordering': ('title', 'id'),
            },
        ),
        migrations.CreateModel(
            name='ExpenseSubcategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('code', models.CharField(max_length=80, unique=True)),
                ('title_dari', models.CharField(blank=True, max_length=180)),
                ('title_pashto', models.CharField(blank=True, max_length=180)),
                ('title_english', models.CharField(blank=True, max_length=180)),
                ('category', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='subcategories', to='clinic.expensecategory')),
            ],
            options={
                'verbose_name_plural': 'expense subcategories',
                'ordering': ('category__title', 'code'),
            },
        ),
        migrations.RunPython(create_legacy_expense_subcategories, remove_legacy_expense_subcategories),
    ]
