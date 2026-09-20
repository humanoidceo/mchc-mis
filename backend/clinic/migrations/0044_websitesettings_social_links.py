from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0043_emergencyserviceprice'),
    ]

    operations = [
        migrations.AddField(
            model_name='websitesettings',
            name='social_links',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
