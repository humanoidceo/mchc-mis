from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from accounts.models import StaffProfile
from accounts.permissions import Role


class Command(BaseCommand):
    help = 'Create or update the initial MCHC super admin.'

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True)
        parser.add_argument('--password', required=True)
        parser.add_argument('--email', default='')

    def handle(self, *args, **options):
        if len(options['password']) < 8:
            raise CommandError('Password must be at least 8 characters.')

        User = get_user_model()
        user, created = User.objects.get_or_create(username=options['username'])
        user.email = options['email']
        user.is_active = True
        user.is_staff = True
        user.is_superuser = True
        user.set_password(options['password'])
        user.save()

        StaffProfile.objects.update_or_create(
            user=user,
            defaults={'role': Role.SUPER_ADMIN, 'allowed_permissions': []},
        )
        action = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{action} super admin "{user.username}".'))
