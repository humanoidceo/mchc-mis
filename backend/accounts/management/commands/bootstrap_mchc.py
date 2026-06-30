from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create or update the initial MCHC super admin.'

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True)
        parser.add_argument('--password', required=True)
        parser.add_argument('--email', default='')

    def handle(self, *args, **options):
        call_command(
            'seed_super_admin',
            username=options['username'],
            password=options['password'],
            email=options['email'],
        )
