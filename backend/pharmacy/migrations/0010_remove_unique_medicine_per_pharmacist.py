from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0009_merge_20260707_0001"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="medicine",
            name="unique_medicine_per_pharmacist",
        ),
    ]
