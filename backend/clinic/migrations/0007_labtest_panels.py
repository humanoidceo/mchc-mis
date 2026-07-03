from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0006_clinicaldocument_payment'),
    ]

    operations = [
        migrations.AddField(
            model_name='labtest',
            name='category',
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name='labtest',
            name='display_name',
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name='labtest',
            name='is_panel',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='labtest',
            name='parent_panel',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='components', to='clinic.labtest'),
        ),
        migrations.AddField(
            model_name='labtest',
            name='sort_order',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AlterModelOptions(
            name='labtest',
            options={'ordering': ('category', 'sort_order', 'name')},
        ),
    ]
