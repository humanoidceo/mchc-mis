from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('clinic', '0021_rename_general_health_department_to_opd'),
    ]

    operations = [
        migrations.CreateModel(
            name='DoctorDepartmentAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('department', models.CharField(max_length=120)),
                ('assigned_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assigned_doctor_departments', to=settings.AUTH_USER_MODEL)),
                ('doctor', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='doctor_department_assignment', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ('department', 'doctor__username')},
        ),
    ]
