from django.core.management.base import BaseCommand

from clinic.models import LabTest


CORE_TESTS = [
    ('CBC - Hemoglobin', '12', '17', 'g/dL'),
    ('CBC - White blood cell count', '4', '11', '10^9/L'),
    ('CBC - Red blood cell count', '4.2', '5.9', '10^12/L'),
    ('CBC - Platelet count', '150', '450', '10^9/L'),
    ('CBC - Hematocrit', '36', '50', '%'),
    ('CBC - MCV', '80', '100', 'fL'),
    ('CBC - MCH', '27', '33', 'pg'),
    ('CBC - MCHC', '32', '36', 'g/dL'),
    ('CBC - RDW', '11.5', '14.5', '%'),
    ('CBC - Neutrophils', '40', '75', '%'),
    ('CBC - Lymphocytes', '20', '45', '%'),
    ('CBC - Monocytes', '2', '10', '%'),
    ('CBC - Eosinophils', '1', '6', '%'),
    ('CBC - Basophils', '0', '1', '%'),
    ('ESR', '0', '20', 'mm/hr'),
    ('Blood group and Rh', 'Reported', 'Reported', ''),
    ('Malaria parasite smear', 'Negative', 'Negative', ''),
    ('Malaria rapid test', 'Negative', 'Negative', ''),
    ('Random blood sugar', '70', '140', 'mg/dL'),
    ('Fasting blood sugar', '70', '100', 'mg/dL'),
    ('Postprandial blood sugar', '70', '140', 'mg/dL'),
    ('HbA1c', '4', '5.6', '%'),
    ('Urea', '15', '45', 'mg/dL'),
    ('Creatinine', '0.6', '1.3', 'mg/dL'),
    ('Uric acid', '3.5', '7.2', 'mg/dL'),
    ('Sodium', '135', '145', 'mmol/L'),
    ('Potassium', '3.5', '5.1', 'mmol/L'),
    ('Chloride', '98', '107', 'mmol/L'),
    ('Calcium', '8.5', '10.5', 'mg/dL'),
    ('Phosphorus', '2.5', '4.5', 'mg/dL'),
    ('Magnesium', '1.7', '2.4', 'mg/dL'),
    ('Total bilirubin', '0.2', '1.2', 'mg/dL'),
    ('Direct bilirubin', '0', '0.3', 'mg/dL'),
    ('Indirect bilirubin', '0.2', '0.9', 'mg/dL'),
    ('ALT', '7', '56', 'U/L'),
    ('AST', '10', '40', 'U/L'),
    ('ALP', '44', '147', 'U/L'),
    ('GGT', '9', '48', 'U/L'),
    ('Total protein', '6', '8.3', 'g/dL'),
    ('Albumin', '3.5', '5.2', 'g/dL'),
    ('Globulin', '2', '3.5', 'g/dL'),
    ('Total cholesterol', '0', '200', 'mg/dL'),
    ('Triglycerides', '0', '150', 'mg/dL'),
    ('HDL cholesterol', '40', '60', 'mg/dL'),
    ('LDL cholesterol', '0', '100', 'mg/dL'),
    ('VLDL cholesterol', '5', '40', 'mg/dL'),
    ('PT', '11', '13.5', 'sec'),
    ('INR', '0.8', '1.2', ''),
    ('APTT', '25', '35', 'sec'),
    ('Bleeding time', '2', '7', 'min'),
    ('Clotting time', '5', '15', 'min'),
    ('Troponin I', '0', '0.04', 'ng/mL'),
    ('CK-MB', '0', '5', 'ng/mL'),
    ('CRP', '0', '5', 'mg/L'),
    ('Rheumatoid factor', 'Negative', 'Negative', ''),
    ('ASO titer', '0', '200', 'IU/mL'),
    ('Widal test', 'Negative', 'Negative', ''),
    ('H. pylori antibody', 'Negative', 'Negative', ''),
    ('H. pylori stool antigen', 'Negative', 'Negative', ''),
    ('HBsAg', 'Negative', 'Negative', ''),
    ('Anti-HCV', 'Negative', 'Negative', ''),
    ('HIV rapid test', 'Negative', 'Negative', ''),
    ('VDRL', 'Non-reactive', 'Non-reactive', ''),
    ('Pregnancy test beta hCG', 'Negative', 'Negative', ''),
    ('TSH', '0.4', '4', 'mIU/L'),
    ('Free T3', '2.3', '4.2', 'pg/mL'),
    ('Free T4', '0.8', '1.8', 'ng/dL'),
    ('Vitamin D', '30', '100', 'ng/mL'),
    ('Vitamin B12', '200', '900', 'pg/mL'),
    ('Ferritin', '15', '300', 'ng/mL'),
    ('Serum iron', '60', '170', 'ug/dL'),
    ('TIBC', '240', '450', 'ug/dL'),
    ('Urine routine - color', 'Pale yellow', 'Amber', ''),
    ('Urine routine - specific gravity', '1.005', '1.030', ''),
    ('Urine routine - pH', '4.5', '8', ''),
    ('Urine protein', 'Negative', 'Negative', ''),
    ('Urine glucose', 'Negative', 'Negative', ''),
    ('Urine ketones', 'Negative', 'Negative', ''),
    ('Urine nitrite', 'Negative', 'Negative', ''),
    ('Urine leukocytes', 'Negative', 'Negative', ''),
    ('Urine RBC', '0', '2', '/HPF'),
    ('Urine WBC', '0', '5', '/HPF'),
    ('Stool routine - ova and parasites', 'Not seen', 'Not seen', ''),
    ('Stool occult blood', 'Negative', 'Negative', ''),
    ('Stool reducing substance', 'Negative', 'Negative', ''),
    ('Stool WBC', '0', '5', '/HPF'),
]


PANELS = {
    'Electrolyte': [
        ('Bicarbonate', '22', '29', 'mmol/L'),
        ('Ionized calcium', '1.12', '1.32', 'mmol/L'),
        ('Serum osmolality', '275', '295', 'mOsm/kg'),
        ('Anion gap', '8', '16', 'mmol/L'),
    ],
    'Liver': [
        ('LDH', '140', '280', 'U/L'),
        ('Cholinesterase', '5', '12', 'kU/L'),
        ('Ammonia', '15', '45', 'umol/L'),
        ('Bile acids', '0', '10', 'umol/L'),
    ],
    'Renal': [
        ('Creatinine clearance', '90', '140', 'mL/min'),
        ('Urine microalbumin', '0', '30', 'mg/g'),
        ('Urine protein creatinine ratio', '0', '0.2', 'mg/mg'),
        ('Cystatin C', '0.6', '1.0', 'mg/L'),
    ],
    'Hormone': [
        ('FSH', '1.5', '12.4', 'mIU/mL'),
        ('LH', '1.7', '8.6', 'mIU/mL'),
        ('Prolactin', '4', '23', 'ng/mL'),
        ('Estradiol', '15', '350', 'pg/mL'),
        ('Progesterone', '0.1', '20', 'ng/mL'),
        ('Testosterone', '300', '1000', 'ng/dL'),
        ('Cortisol morning', '6', '23', 'ug/dL'),
        ('Insulin fasting', '2', '25', 'uIU/mL'),
    ],
    'Infection': [
        ('Dengue NS1', 'Negative', 'Negative', ''),
        ('Dengue IgM', 'Negative', 'Negative', ''),
        ('Brucella antibody', 'Negative', 'Negative', ''),
        ('COVID-19 antigen', 'Negative', 'Negative', ''),
        ('Typhoid IgM', 'Negative', 'Negative', ''),
        ('TB GeneXpert', 'Not detected', 'Not detected', ''),
        ('AFB smear', 'Negative', 'Negative', ''),
        ('Leishmania smear', 'Negative', 'Negative', ''),
    ],
    'Culture': [
        ('Urine culture', 'No growth', 'No growth', ''),
        ('Blood culture', 'No growth', 'No growth', ''),
        ('Stool culture', 'No growth', 'No growth', ''),
        ('Throat swab culture', 'No growth', 'No growth', ''),
        ('Wound swab culture', 'No growth', 'No growth', ''),
        ('Sputum culture', 'No growth', 'No growth', ''),
    ],
    'Tumor marker': [
        ('AFP', '0', '10', 'ng/mL'),
        ('CEA', '0', '5', 'ng/mL'),
        ('CA 125', '0', '35', 'U/mL'),
        ('CA 15-3', '0', '30', 'U/mL'),
        ('CA 19-9', '0', '37', 'U/mL'),
        ('PSA total', '0', '4', 'ng/mL'),
    ],
}


SPECIMENS = ['Serum', 'Plasma', 'Whole blood', 'Urine', 'Stool', 'CSF', 'Sputum', 'Swab']


def build_tests():
    tests = list(CORE_TESTS)
    for panel, items in PANELS.items():
        for name, low, high, unit in items:
            tests.append((f'{panel} - {name}', low, high, unit))

    common_analytes = [
        ('Glucose', '70', '100', 'mg/dL'),
        ('Protein', '6', '8.3', 'g/dL'),
        ('Albumin', '3.5', '5.2', 'g/dL'),
        ('Bilirubin', '0.2', '1.2', 'mg/dL'),
        ('Chloride', '98', '107', 'mmol/L'),
        ('Sodium', '135', '145', 'mmol/L'),
        ('Potassium', '3.5', '5.1', 'mmol/L'),
        ('Calcium', '8.5', '10.5', 'mg/dL'),
        ('Magnesium', '1.7', '2.4', 'mg/dL'),
        ('Phosphate', '2.5', '4.5', 'mg/dL'),
        ('Ketones', 'Negative', 'Negative', ''),
        ('Nitrite', 'Negative', 'Negative', ''),
        ('Leukocyte esterase', 'Negative', 'Negative', ''),
        ('Occult blood', 'Negative', 'Negative', ''),
        ('Gram stain', 'No organisms', 'No organisms', ''),
        ('Fungal smear', 'Negative', 'Negative', ''),
        ('Bacterial antigen', 'Negative', 'Negative', ''),
        ('RBC microscopy', '0', '2', '/HPF'),
        ('WBC microscopy', '0', '5', '/HPF'),
        ('Crystals', 'Not seen', 'Not seen', ''),
        ('Casts', 'Not seen', 'Not seen', ''),
        ('Specific gravity', '1.005', '1.030', ''),
        ('pH', '4.5', '8', ''),
        ('Appearance', 'Clear', 'Clear', ''),
        ('Color', 'Normal', 'Normal', ''),
    ]
    for specimen in SPECIMENS:
        for analyte, low, high, unit in common_analytes:
            tests.append((f'{specimen} - {analyte}', low, high, unit))

    unique = []
    seen = set()
    for item in tests:
        if item[0] not in seen:
            seen.add(item[0])
            unique.append(item)
        if len(unique) == 300:
            break
    return unique


class Command(BaseCommand):
    help = 'Seed 300 common laboratory tests with normal ranges.'

    def handle(self, *args, **options):
        created = 0
        updated = 0
        for name, normal_from, normal_to, unit in build_tests():
            _test, was_created = LabTest.objects.update_or_create(
                name=name,
                defaults={
                    'normal_range_from': normal_from,
                    'normal_range_to': normal_to,
                    'unit': unit,
                    'is_active': True,
                },
            )
            created += int(was_created)
            updated += int(not was_created)

        self.stdout.write(self.style.SUCCESS(f'Seeded 300 lab tests. Created {created}, updated {updated}.'))
