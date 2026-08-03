import ast
import json
from datetime import datetime
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from clinic.models import ClinicalDocument, Patient, Payment


DOCUMENT_FIELDS = (
    'id', 'created_at', 'updated_at', 'document_type', 'title', 'payload',
    'total_amount', 'created_by_id', 'patient_id', 'payment_id', 'deleted_at',
    'deleted_by_id',
)


def split_sql_values(values_sql: str):
    rows = []
    start = None
    depth = 0
    quote = False
    index = 0
    while index < len(values_sql):
        char = values_sql[index]
        if quote:
            if char == '\\':
                index += 2
                continue
            if char == "'":
                quote = False
        elif char == "'":
            quote = True
        elif char == '(':
            if depth == 0:
                start = index
            depth += 1
        elif char == ')':
            depth -= 1
            if depth == 0 and start is not None:
                rows.append(values_sql[start + 1:index])
                start = None
        index += 1
    if quote or depth:
        raise CommandError('Could not read the laboratory document values from the backup.')
    return rows


def split_sql_columns(row_sql: str):
    columns = []
    start = 0
    quote = False
    index = 0
    while index < len(row_sql):
        char = row_sql[index]
        if quote:
            if char == '\\':
                index += 2
                continue
            if char == "'":
                quote = False
        elif char == "'":
            quote = True
        elif char == ',':
            columns.append(row_sql[start:index].strip())
            start = index + 1
        index += 1
    columns.append(row_sql[start:].strip())
    return columns


def decode_sql_value(value: str):
    if value == 'NULL':
        return None
    if value.startswith("'") and value.endswith("'"):
        try:
            return ast.literal_eval(value)
        except (SyntaxError, ValueError) as error:
            raise CommandError(f'Could not decode a backup value: {error}') from error
    return value


def backup_lab_bills(backup_path: Path):
    content = backup_path.read_text(encoding='utf-8')
    quote = chr(96)
    marker = 'INSERT INTO ' + quote + 'clinic_clinicaldocument' + quote + ' VALUES '
    start = content.find(marker)
    if start < 0:
        raise CommandError('The backup does not contain clinic_clinicaldocument records.')
    values_start = start + len(marker)
    values_end = content.find(';', values_start)
    if values_end < 0:
        raise CommandError('The clinic_clinicaldocument insert statement is incomplete.')

    bills = []
    for row_sql in split_sql_values(content[values_start:values_end]):
        values = [decode_sql_value(value) for value in split_sql_columns(row_sql)]
        if len(values) != len(DOCUMENT_FIELDS):
            raise CommandError('A clinic_clinicaldocument row has an unexpected number of fields.')
        row = dict(zip(DOCUMENT_FIELDS, values))
        if row['document_type'] != ClinicalDocument.DocumentType.LAB_BILL:
            continue
        row['id'] = int(row['id'])
        row['created_by_id'] = int(row['created_by_id'])
        row['patient_id'] = int(row['patient_id'])
        row['payment_id'] = int(row['payment_id']) if row['payment_id'] is not None else None
        row['deleted_by_id'] = int(row['deleted_by_id']) if row['deleted_by_id'] is not None else None
        row['payload'] = json.loads(row['payload'])
        row['created_at'] = datetime.fromisoformat(row['created_at'])
        row['updated_at'] = datetime.fromisoformat(row['updated_at'])
        row['deleted_at'] = datetime.fromisoformat(row['deleted_at']) if row['deleted_at'] else None
        bills.append(row)
    return bills


class Command(BaseCommand):
    help = 'Safely import only lab_bill documents from an MCHC SQL backup.'

    def add_arguments(self, parser):
        parser.add_argument('backup_path')
        parser.add_argument('--commit', action='store_true', help='Insert records after the dry-run checks pass.')

    def handle(self, *args, **options):
        backup_path = Path(options['backup_path'])
        if not backup_path.is_file():
            raise CommandError(f'Backup file not found: {backup_path}')

        bills = backup_lab_bills(backup_path)
        users = get_user_model()
        blocked = []
        duplicates = 0
        ready_rows = []

        for row in bills:
            missing = []
            if not users.objects.filter(pk=row['created_by_id']).exists():
                missing.append(f"created_by_id={row['created_by_id']}")
            if not Patient.all_objects.filter(pk=row['patient_id']).exists():
                missing.append(f"patient_id={row['patient_id']}")
            if row['payment_id'] is not None and not Payment.all_objects.filter(pk=row['payment_id']).exists():
                missing.append(f"payment_id={row['payment_id']}")
            if row['deleted_by_id'] is not None and not users.objects.filter(pk=row['deleted_by_id']).exists():
                missing.append(f"deleted_by_id={row['deleted_by_id']}")
            if missing:
                blocked.append(f"backup document {row['id']}: {', '.join(missing)}")
                continue

            matches = ClinicalDocument.all_objects.filter(
                document_type=ClinicalDocument.DocumentType.LAB_BILL,
                created_at=row['created_at'],
                patient_id=row['patient_id'],
            )
            if any(document.payload == row['payload'] for document in matches):
                duplicates += 1
                continue
            if row['payment_id'] is not None and ClinicalDocument.all_objects.filter(payment_id=row['payment_id']).exists():
                blocked.append(f"backup document {row['id']}: payment_id={row['payment_id']} is already linked to a current document")
                continue
            ready_rows.append(row)

        self.stdout.write(f'Backup lab_bill records: {len(bills)}')
        self.stdout.write(f'Already present: {duplicates}')
        self.stdout.write(f'Ready to insert: {len(ready_rows)}')
        if blocked:
            self.stdout.write(self.style.ERROR(f'Blocked records: {len(blocked)}'))
            for message in blocked:
                self.stdout.write(self.style.ERROR(message))
            raise CommandError('No records were changed. Resolve the listed link conflicts before importing.')
        if not options['commit']:
            self.stdout.write(self.style.WARNING('Dry run complete. No records were changed.'))
            return

        with transaction.atomic():
            for row in ready_rows:
                ClinicalDocument.all_objects.create(
                    created_at=row['created_at'],
                    updated_at=row['updated_at'],
                    document_type=row['document_type'],
                    title=row['title'],
                    payload=row['payload'],
                    total_amount=row['total_amount'],
                    created_by_id=row['created_by_id'],
                    patient_id=row['patient_id'],
                    payment_id=row['payment_id'],
                    deleted_at=row['deleted_at'],
                    deleted_by_id=row['deleted_by_id'],
                )
        self.stdout.write(self.style.SUCCESS(f'Imported {len(ready_rows)} laboratory-bill records. No existing records were changed or deleted.'))
