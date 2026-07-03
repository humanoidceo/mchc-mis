from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('accounts', '0008_expenses_manage_permission'),
        ('clinic', '0010_expense_amount'),
    ]

    operations = [
        migrations.CreateModel(
            name='SalaryPayment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('afghan_year', models.PositiveIntegerField()),
                ('months', models.JSONField(blank=True, default=list)),
                ('absence_days', models.PositiveIntegerField(default=0)),
                ('advance_payment', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('monthly_salary', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('gross_salary', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('absence_deduction', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('taxable_salary', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('tax_amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('net_salary', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('payable_amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('notes', models.TextField(blank=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='created_salary_payments', to=settings.AUTH_USER_MODEL)),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='salary_payments', to='accounts.employee')),
            ],
            options={
                'ordering': ('-created_at',),
            },
        ),
        migrations.AddField(
            model_name='expense',
            name='salary_payment',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='linked_expense', to='clinic.salarypayment'),
        ),
    ]
