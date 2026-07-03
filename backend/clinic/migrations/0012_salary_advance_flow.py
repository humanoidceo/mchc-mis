from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('accounts', '0008_expenses_manage_permission'),
        ('clinic', '0011_salarypayment_and_expense_link'),
    ]

    operations = [
        migrations.AddField(
            model_name='salarypayment',
            name='advance_balance_carried',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.CreateModel(
            name='SalaryAdvance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('afghan_year', models.PositiveIntegerField()),
                ('afghan_month', models.CharField(max_length=24)),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('notes', models.TextField(blank=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='created_salary_advances', to=settings.AUTH_USER_MODEL)),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='salary_advances', to='accounts.employee')),
            ],
            options={'ordering': ('-created_at',)},
        ),
        migrations.CreateModel(
            name='SalaryAdvanceSettlement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('salary_advance', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='settlements', to='clinic.salaryadvance')),
                ('salary_payment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='advance_settlements', to='clinic.salarypayment')),
            ],
            options={'ordering': ('created_at', 'id')},
        ),
        migrations.AddField(
            model_name='expense',
            name='salary_advance',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='linked_expense', to='clinic.salaryadvance'),
        ),
    ]
