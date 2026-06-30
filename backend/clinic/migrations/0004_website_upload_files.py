from django.db import migrations, models

import clinic.models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0003_website_content'),
    ]

    operations = [
        migrations.AddField(
            model_name='websitepagecontent',
            name='image_file',
            field=models.FileField(blank=True, upload_to=clinic.models.website_page_image_upload_path),
        ),
        migrations.AddField(
            model_name='websitesettings',
            name='logo_file',
            field=models.FileField(blank=True, upload_to=clinic.models.website_logo_upload_path),
        ),
    ]
