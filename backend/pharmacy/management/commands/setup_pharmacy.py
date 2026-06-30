from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create the Pharmacist group for pharmacy module access."

    def handle(self, *args, **options):
        group, created = Group.objects.get_or_create(name="Pharmacist")
        if created:
            self.stdout.write(self.style.SUCCESS("Pharmacist group created."))
        else:
            self.stdout.write(self.style.SUCCESS("Pharmacist group already exists."))
