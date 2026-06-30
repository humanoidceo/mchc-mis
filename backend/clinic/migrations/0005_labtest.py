from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0004_website_upload_files'),
    ]

    operations = [
        migrations.CreateModel(
            name='LabTest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=160, unique=True)),
                ('normal_range_from', models.CharField(blank=True, max_length=80)),
                ('normal_range_to', models.CharField(blank=True, max_length=80)),
                ('unit', models.CharField(blank=True, max_length=40)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={
                'ordering': ('name',),
            },
        ),
    ]
