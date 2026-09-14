# Generated manually for the production-safe website header text setting.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0036_websitegalleryimage'),
    ]

    operations = [
        migrations.AddField(
            model_name='websitesettings',
            name='header_content',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
