from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import clinic.models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0034_payment_midwifery_service'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='WebsitePost',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title_en', models.CharField(max_length=240)),
                ('title_fa', models.CharField(max_length=240)),
                ('title_ps', models.CharField(max_length=240)),
                ('content_en', models.TextField()),
                ('content_fa', models.TextField()),
                ('content_ps', models.TextField()),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_website_posts', to=settings.AUTH_USER_MODEL)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_website_posts', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ('-created_at', '-id')},
        ),
        migrations.CreateModel(
            name='WebsitePostImage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('image', models.FileField(upload_to=clinic.models.website_post_image_upload_path)),
                ('post', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='images', to='clinic.websitepost')),
            ],
            options={'ordering': ('created_at', 'id')},
        ),
    ]
