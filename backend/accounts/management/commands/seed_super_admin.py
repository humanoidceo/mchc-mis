import os

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from accounts.models import StaffProfile
from accounts.permissions import Role, default_permissions_for_role


class Command(BaseCommand):
    help = 'Create or update the initial MCHC super admin.'

    def add_arguments(self, parser):
        parser.add_argument('--username', default=os.getenv('SUPER_ADMIN_USERNAME', 'admin'))
        parser.add_argument('--password', default=os.getenv('SUPER_ADMIN_PASSWORD'))
        parser.add_argument('--email', default=os.getenv('SUPER_ADMIN_EMAIL', 'admin@example.com'))
        parser.add_argument('--first-name', default=os.getenv('SUPER_ADMIN_FIRST_NAME', 'Super'))
        parser.add_argument('--last-name', default=os.getenv('SUPER_ADMIN_LAST_NAME', 'Admin'))
        parser.add_argument(
            '--skip-permissions',
            action='store_true',
            help='Do not run the permission seeder after creating the super admin.',
        )

    def handle(self, *args, **options):
        password = options['password']
        if not password:
            raise CommandError('Password is required. Pass --password or set SUPER_ADMIN_PASSWORD in backend/.env.')
        if len(password) < 8:
            raise CommandError('Password must be at least 8 characters.')

        User = get_user_model()
        user, created = User.objects.get_or_create(username=options['username'])
        user.email = options['email']
        user.first_name = options['first_name']
        user.last_name = options['last_name']
        user.is_active = True
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()

        StaffProfile.objects.update_or_create(
            user=user,
            defaults={
                'role': Role.SUPER_ADMIN,
                'allowed_permissions': default_permissions_for_role(Role.SUPER_ADMIN),
            },
        )

        if not options['skip_permissions']:
            call_command('seed_permissions')

        action = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{action} super admin "{user.username}".'))
