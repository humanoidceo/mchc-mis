from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0018_clinicaldocument_result_file'),
    ]

    operations = [
        migrations.AlterField(
            model_name='expense',
            name='name',
            field=models.CharField(blank=True, default='', max_length=180),
        ),
    ]
