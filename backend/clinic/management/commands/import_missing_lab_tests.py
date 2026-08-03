from django.core.management.base import BaseCommand
from django.db import transaction

from clinic.management.commands.labtests import build_catalog
from clinic.models import LabTest


def normalized(value):
    return str(value or '').strip().casefold()


def test_key(display_name, parent_name, is_panel):
    return (normalized(display_name), normalized(parent_name), bool(is_panel))


class Command(BaseCommand):
    help = 'Add only laboratory tests from lab-test.xls that are missing by panel and display name.'

    def add_arguments(self, parser):
        parser.add_argument('--commit', action='store_true', help='Create the missing tests after reviewing the dry run.')

    def handle(self, *args, **options):
        catalog = build_catalog()
        active_tests = list(LabTest.objects.select_related('parent_panel').filter(is_active=True))
        existing_keys = {
            test_key(
                test.display_name,
                test.parent_panel.display_name if test.parent_panel else '',
                test.is_panel,
            )
            for test in active_tests
        }
        missing = [
            record
            for record in catalog
            if test_key(record['display_name'], record['parent_name'], record['is_panel']) not in existing_keys
        ]

        self.stdout.write(f'Workbook catalog entries: {len(catalog)}')
        self.stdout.write(f'Missing entries: {len(missing)}')
        for record in missing:
            self.stdout.write(f"- {record['name']}")

        if not options['commit']:
            self.stdout.write(self.style.WARNING('Dry run complete. No tests were changed.'))
            return

        created = []
        with transaction.atomic():
            panels = {
                normalized(test.display_name): test
                for test in LabTest.objects.filter(is_active=True, is_panel=True)
            }
            for record in missing:
                if not record['is_panel']:
                    continue
                test, was_created = LabTest.objects.get_or_create(
                    name=record['name'],
                    defaults={
                        'display_name': record['display_name'],
                        'category': record['category'],
                        'is_panel': True,
                        'parent_panel': None,
                        'sort_order': record['sort_order'],
                        'normal_range_from': '',
                        'normal_range_to': '',
                        'unit': '',
                        'is_active': True,
                    },
                )
                panels[normalized(record['display_name'])] = test
                if was_created:
                    created.append(test.name)

            for record in missing:
                if record['is_panel']:
                    continue
                parent = panels.get(normalized(record['parent_name']))
                if parent is None:
                    raise RuntimeError(f"Missing parent panel: {record['parent_name']}")
                test, was_created = LabTest.objects.get_or_create(
                    name=record['name'],
                    defaults={
                        'display_name': record['display_name'],
                        'category': record['category'],
                        'is_panel': False,
                        'parent_panel': parent,
                        'sort_order': record['sort_order'],
                        'normal_range_from': record['normal_range_from'],
                        'normal_range_to': record['normal_range_to'],
                        'unit': record['unit'],
                        'is_active': True,
                    },
                )
                if was_created:
                    created.append(test.name)

        self.stdout.write(self.style.SUCCESS(f'Created {len(created)} tests. Existing tests were not changed or removed.'))
