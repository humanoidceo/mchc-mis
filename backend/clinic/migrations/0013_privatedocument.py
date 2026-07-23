from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import clinic.models


class Migration(migrations.Migration):
    dependencies = [
        ('clinic', '0012_salary_advance_flow'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PrivateDocument',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=180)),
                ('category', models.CharField(max_length=120)),
                ('file', models.FileField(upload_to=clinic.models.private_document_upload_path)),
                ('max_size_mb', models.DecimalField(decimal_places=2, default=1, max_digits=6)),
                ('uploaded_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='private_documents', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ('-created_at', 'title'),
            },
        ),
    ]
