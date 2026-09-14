# Generated manually for the production-safe News page text editor option.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0037_websitesettings_header_content'),
    ]

    operations = [
        migrations.AlterField(
            model_name='websitepagecontent',
            name='page',
            field=models.CharField(
                choices=[
                    ('home', 'Home'),
                    ('about', 'About'),
                    ('mission', 'Our mission'),
                    ('vision', 'Our vision'),
                    ('services', 'Services'),
                    ('contact', 'Contact'),
                    ('news', 'News page'),
                ],
                max_length=32,
            ),
        ),
    ]
