from __future__ import annotations

from decimal import Decimal, InvalidOperation
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from pharmacy.models import Medicine, PharmacySetting


SPREADSHEET_NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for item in root.findall("a:si", SPREADSHEET_NS):
        strings.append("".join(node.text or "" for node in item.iterfind(".//a:t", SPREADSHEET_NS)))
    return strings


def parse_sheet_rows(workbook_path: Path, worksheet: str = "xl/worksheets/sheet1.xml") -> list[dict[str, str]]:
    with zipfile.ZipFile(workbook_path) as archive:
        if worksheet not in archive.namelist():
            raise CommandError(f"Worksheet {worksheet} was not found in {workbook_path}.")

        shared_strings = read_shared_strings(archive)
        root = ET.fromstring(archive.read(worksheet))
        rows = root.findall(".//a:sheetData/a:row", SPREADSHEET_NS)
        parsed_rows: list[dict[str, str]] = []

        for row in rows:
            values: dict[str, str] = {}
            for cell in row.findall("a:c", SPREADSHEET_NS):
                reference = cell.attrib.get("r", "")
                column = "".join(ch for ch in reference if ch.isalpha())
                cell_type = cell.attrib.get("t")
                raw_value = ""
                value_node = cell.find("a:v", SPREADSHEET_NS)
                if value_node is not None:
                    raw_value = value_node.text or ""
                    if cell_type == "s":
                        raw_value = shared_strings[int(raw_value)]
                values[column] = raw_value.strip()
            parsed_rows.append(values)
        return parsed_rows


def parse_decimal(value: str, field_name: str, row_number: int) -> Decimal:
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError) as exc:
        raise CommandError(f"Invalid {field_name} on spreadsheet row {row_number}: {value!r}") from exc


class Command(BaseCommand):
    help = "Import medicines from an uploaded pharmacy Excel workbook into a pharmacist's stock."

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            default="/var/www/mchc-mis/backend/pharmacy-medicines-list.xlsx",
            help="Absolute path to the .xlsx workbook.",
        )
        parser.add_argument(
            "--username",
            default="pharm",
            help="Pharmacist username that should own the imported medicine stock.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        workbook_path = Path(options["file"]).expanduser()
        username = str(options["username"]).strip()

        if not workbook_path.exists():
            raise CommandError(f"Workbook not found: {workbook_path}")

        User = get_user_model()
        pharmacist = User.objects.filter(username=username).first()
        if pharmacist is None:
            raise CommandError(f"Pharmacist user not found: {username}")

        PharmacySetting.objects.get_or_create(pharmacist=pharmacist)

        rows = parse_sheet_rows(workbook_path)
        if len(rows) < 2:
            raise CommandError("The workbook does not contain any medicine rows.")

        header = rows[0]
        expected = {
            "A": "Medicine name",
            "B": "Generic Name",
            "C": "Dosage form",
            "D": "Strength",
            "E": "Quantity",
            "F": "Buy price",
        }
        for column, expected_label in expected.items():
            actual = header.get(column, "")
            if actual != expected_label:
                raise CommandError(f"Unexpected header in column {column}: expected {expected_label!r}, found {actual!r}")

        created_count = 0
        updated_count = 0
        skipped_count = 0

        for spreadsheet_index, row in enumerate(rows[1:], start=3):
            name = row.get("A", "").strip()
            generic_name = row.get("B", "").strip()
            dosage_form = row.get("C", "").strip()
            strength = row.get("D", "").strip()
            quantity_raw = row.get("E", "").strip()
            buy_price_raw = row.get("F", "").strip()

            if not name:
                skipped_count += 1
                continue

            quantity = parse_decimal(quantity_raw or "0", "quantity", spreadsheet_index)
            buy_price = parse_decimal(buy_price_raw or "0", "buy price", spreadsheet_index)

            defaults = {
                "dosage_form": dosage_form,
                "strength": strength,
                "quantity": quantity,
                "buy_price": buy_price,
            }

            medicine, created = Medicine.objects.get_or_create(
                pharmacist=pharmacist,
                name=name,
                generic_name=generic_name,
                defaults=defaults | {
                    "country_of_product": "",
                    "production_date": None,
                    "expiry_date": None,
                },
            )

            if created:
                created_count += 1
                continue

            medicine.dosage_form = dosage_form
            medicine.strength = strength
            medicine.quantity = quantity
            medicine.buy_price = buy_price
            medicine.save(update_fields=["dosage_form", "strength", "quantity", "buy_price", "sell_price", "profit_percentage", "updated_at"])
            updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Imported workbook for pharmacist {username}. Created: {created_count}, updated: {updated_count}, skipped: {skipped_count}."
            )
        )
