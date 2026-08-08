from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('clinic', '0022_doctordepartmentassignment'),
    ]

    operations = [
        migrations.AlterField(
            model_name='doctordepartmentassignment',
            name='doctor',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='doctor_department_assignments',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddConstraint(
            model_name='doctordepartmentassignment',
            constraint=models.UniqueConstraint(fields=('doctor', 'department'), name='unique_clinical_staff_department'),
        ),
    ]
