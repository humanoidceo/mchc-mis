from django.db import migrations, models


def copy_category_titles_to_english(apps, schema_editor):
    ExpenseCategory = apps.get_model('clinic', 'ExpenseCategory')
    for category in ExpenseCategory.objects.all().iterator():
        category.title_english = category.title
        category.save(update_fields=['title_english'])


def restore_category_titles(apps, schema_editor):
    ExpenseCategory = apps.get_model('clinic', 'ExpenseCategory')
    for category in ExpenseCategory.objects.all().iterator():
        category.title = category.title_english or category.title_dari or category.title_pashto or f'Category {category.id}'
        category.save(update_fields=['title'])


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0024_expensecategory_expensesubcategory'),
    ]

    operations = [
        migrations.AddField(
            model_name='expensecategory',
            name='title_dari',
            field=models.CharField(blank=True, max_length=180),
        ),
        migrations.AddField(
            model_name='expensecategory',
            name='title_pashto',
            field=models.CharField(blank=True, max_length=180),
        ),
        migrations.AddField(
            model_name='expensecategory',
            name='title_english',
            field=models.CharField(blank=True, max_length=180),
        ),
        migrations.RunPython(copy_category_titles_to_english, restore_category_titles),
        migrations.RemoveField(
            model_name='expensecategory',
            name='title',
        ),
        migrations.AlterModelOptions(
            name='expensecategory',
            options={'ordering': ('title_english', 'title_dari', 'title_pashto', 'id'), 'verbose_name_plural': 'expense categories'},
        ),
        migrations.AlterModelOptions(
            name='expensesubcategory',
            options={'ordering': ('category__title_english', 'category__title_dari', 'category__title_pashto', 'code'), 'verbose_name_plural': 'expense subcategories'},
        ),
    ]
