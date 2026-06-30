import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0002_reception_billing_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='WebsiteSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('logo_url', models.CharField(blank=True, max_length=500)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_website_settings', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name_plural': 'website settings',
            },
        ),
        migrations.CreateModel(
            name='WebsitePageContent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('page', models.CharField(choices=[('home', 'Home'), ('about', 'About'), ('mission', 'Our mission'), ('vision', 'Our vision'), ('services', 'Services'), ('contact', 'Contact')], max_length=32)),
                ('language', models.CharField(choices=[('en', 'English'), ('fa', 'Dari'), ('ps', 'Pashto')], max_length=2)),
                ('content', models.JSONField(blank=True, default=dict)),
                ('image_url', models.CharField(blank=True, max_length=500)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_website_pages', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ('page', 'language'),
                'constraints': [models.UniqueConstraint(fields=('page', 'language'), name='unique_website_page_language')],
            },
        ),
    ]
