from django.core.management.base import BaseCommand

from accounts.models import StaffProfile
from accounts.permissions import PERMISSION_DEFINITIONS, ROLE_CHOICES, default_permissions_for_role


class Command(BaseCommand):
    help = 'Seed role-based MCHC permissions onto existing staff profiles.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Replace every staff profile permission list with the default permissions for its role.',
        )

    def handle(self, *args, **options):
        reset = options['reset']
        known_roles = {code for code, _label in ROLE_CHOICES}
        known_permissions = {permission.code for permission in PERMISSION_DEFINITIONS}
        updated_count = 0
        skipped_count = 0

        for profile in StaffProfile.objects.select_related('user').order_by('user__username'):
            if profile.role not in known_roles:
                skipped_count += 1
                self.stdout.write(self.style.WARNING(f'Skipped {profile.user.username}: unknown role "{profile.role}".'))
                continue

            defaults = default_permissions_for_role(profile.role)
            current = [code for code in profile.allowed_permissions or [] if code in known_permissions]
            desired = defaults if reset or not current else current

            if desired != profile.allowed_permissions:
                profile.allowed_permissions = desired
                profile.save(update_fields=['allowed_permissions', 'updated_at'])
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Seeded {len(PERMISSION_DEFINITIONS)} permissions. '
                f'Updated {updated_count} staff profile(s), skipped {skipped_count}.'
            )
        )
