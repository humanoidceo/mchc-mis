from collections import defaultdict
from pathlib import Path

import xlrd
from django.core.management.base import BaseCommand

from clinic.models import LabTest


WORKBOOK_PATH = Path(__file__).resolve().parents[4] / 'lab-test.xls'


def numeric(display_name: str, low: str, high: str, unit: str):
    return {
        'display_name': display_name,
        'normal_range_from': low,
        'normal_range_to': high,
        'unit': unit,
    }


def qualitative(display_name: str, normal: str = 'Negative'):
    return {
        'display_name': display_name,
        'normal_range_from': normal,
        'normal_range_to': normal,
        'unit': '',
    }


def interpretive(display_name: str, normal_from: str, normal_to: str = ''):
    return {
        'display_name': display_name,
        'normal_range_from': normal_from,
        'normal_range_to': normal_to or normal_from,
        'unit': '',
    }


def text_only(display_name: str, unit: str = ''):
    return {
        'display_name': display_name,
        'normal_range_from': '',
        'normal_range_to': '',
        'unit': unit,
    }


ANTIBIOTIC_SENSITIVITY_COMPONENTS = [
    text_only('Ampicillin'),
    text_only('Amikacin'),
    text_only('Azithromycin'),
    text_only('Cephalexin'),
    text_only('Cephalosporin'),
    text_only('Chloramphenicol'),
    text_only('Ciprofloxacin'),
    text_only('Clindamycin'),
    text_only('Cotrimoxazole'),
    text_only('Erythromycin'),
    text_only('Gentamicin'),
    text_only('Levofloxacin'),
    text_only('Nalidixic acid'),
    text_only('Norfloxacin'),
    text_only('Ofloxacin'),
    text_only('Oxacillin'),
    text_only('Penicillin'),
    text_only('Tetracycline'),
    text_only('Trimethazole'),
    text_only('Rifampicin'),
]


PANEL_BLUEPRINT = [
    {
        'sheet': 'Blood Smear',
        'category': 'Hematology',
        'name': 'Blood smear',
        'prefix': 'BS',
        'components': [
            numeric('Hemoglobin', '12', '17', 'g/dL'),
            numeric('White blood cell count', '4', '11', '10^9/L'),
            numeric('Platelet count', '150', '450', '10^9/L'),
            numeric('Reticulocytes', '0.5', '2.5', '%'),
            numeric('Neutrophils', '40', '75', '%'),
            numeric('Lymphocytes', '20', '45', '%'),
            numeric('Eosinophils', '1', '6', '%'),
            numeric('Monocytes', '2', '10', '%'),
            numeric('Basophils', '0', '1', '%'),
            numeric('Erythrocyte sedimentation rate (ESR)', '0', '20', 'mm/hr'),
            qualitative('Malaria parasite smear', 'Negative'),
            text_only('RBC morphology comment'),
            text_only('Remarks'),
        ],
    },
    {
        'sheet': 'CBC',
        'category': 'Hematology',
        'name': 'CBC',
        'prefix': 'CBC',
        'components': [
            numeric('Hemoglobin', '12', '17', 'g/dL'),
            numeric('White blood cell count', '4', '11', '10^9/L'),
            numeric('Red blood cell count', '4.2', '5.9', '10^12/L'),
            numeric('Hematocrit', '36', '50', '%'),
            numeric('Platelet count', '150', '450', '10^9/L'),
            numeric('MCV', '80', '100', 'fL'),
            numeric('MCH', '27', '33', 'pg'),
            numeric('MCHC', '32', '36', 'g/dL'),
            numeric('Neutrophils', '40', '75', '%'),
            numeric('Eosinophils', '1', '6', '%'),
            numeric('Lymphocytes', '20', '45', '%'),
            numeric('Monocytes', '2', '10', '%'),
            numeric('Basophils', '0', '1', '%'),
            numeric('Erythrocyte sedimentation rate (ESR)', '0', '20', 'mm/hr'),
        ],
    },
    {
        'sheet': 'BIOC',
        'category': 'Hematology',
        'name': 'Hematology indices',
        'prefix': 'HEMIDX',
        'components': [
            interpretive('Rh factor', 'Positive or Negative'),
            numeric('Red blood cell count', '4.2', '5.9', '10^12/L'),
            numeric('Hematocrit', '36', '50', '%'),
            numeric('MCV', '80', '100', 'fL'),
            numeric('MCH', '27', '33', 'pg'),
            numeric('MCHC', '32', '36', 'g/dL'),
            numeric('Platelet count', '150', '450', '10^9/L'),
            numeric('Reticulocytes', '0.5', '2.5', '%'),
            numeric('Absolute eosinophil count', '0.02', '0.50', '10^9/L'),
            numeric('Bleeding time', '2', '7', 'min'),
            numeric('Clotting time', '5', '15', 'min'),
        ],
    },
    {
        'sheet': 'SP.SMEAR',
        'category': 'Hematology',
        'name': 'Peripheral smear panel',
        'prefix': 'PSM',
        'components': [
            numeric('Hemoglobin', '12', '17', 'g/dL'),
            numeric('Red blood cell count', '4.2', '5.9', '10^12/L'),
            numeric('White blood cell count', '4', '11', '10^9/L'),
            numeric('Neutrophils', '40', '75', '%'),
            numeric('Eosinophils', '1', '6', '%'),
            numeric('Lymphocytes', '20', '45', '%'),
            numeric('Monocytes', '2', '10', '%'),
            numeric('Platelet count', '150', '450', '10^9/L'),
            numeric('Reticulocytes', '0.5', '2.5', '%'),
        ],
    },
    {
        'sheet': 'HBS A1C',
        'category': 'Chemistry',
        'name': 'Glycohemoglobin A1c',
        'prefix': 'A1C',
        'components': [
            numeric('HbA1c', '4.0', '5.6', '%'),
        ],
    },
    {
        'sheet': 'BIO',
        'category': 'Chemistry',
        'name': 'Biochemistry panel',
        'prefix': 'BIO',
        'components': [
            numeric('Fasting blood glucose', '70', '99', 'mg/dL'),
            numeric('Random blood glucose', '70', '140', 'mg/dL'),
            numeric('Postprandial blood glucose', '70', '140', 'mg/dL'),
            numeric('Total cholesterol', '0', '200', 'mg/dL'),
            numeric('Triglycerides', '0', '150', 'mg/dL'),
            numeric('HDL cholesterol', '40', '60', 'mg/dL'),
            numeric('Total cholesterol / HDL ratio', '0', '5', ''),
            numeric('Total bilirubin', '0.2', '1.2', 'mg/dL'),
            numeric('AST', '10', '40', 'U/L'),
            numeric('ALT', '7', '56', 'U/L'),
            numeric('Alkaline phosphatase', '44', '147', 'U/L'),
            numeric('Blood urea', '15', '45', 'mg/dL'),
            numeric('Serum creatinine', '0.6', '1.3', 'mg/dL'),
            numeric('Serum uric acid', '3.5', '7.2', 'mg/dL'),
            numeric('Sodium', '135', '145', 'mmol/L'),
            numeric('Potassium', '3.5', '5.1', 'mmol/L'),
            numeric('Chloride', '98', '107', 'mmol/L'),
            numeric('Serum calcium', '8.5', '10.5', 'mg/dL'),
            numeric('Serum phosphorus', '2.5', '4.5', 'mg/dL'),
        ],
    },
    {
        'sheet': 'BIOCH',
        'category': 'Chemistry',
        'name': 'Extended biochemistry',
        'prefix': 'BIOX',
        'components': [
            numeric('Blood glucose (fasting/random)', '70', '140', 'mg/dL'),
            numeric('Blood glucose (postprandial)', '70', '140', 'mg/dL'),
            numeric('Serum creatinine', '0.6', '1.3', 'mg/dL'),
            numeric('Blood urea', '15', '45', 'mg/dL'),
            numeric('Serum uric acid', '3.5', '7.2', 'mg/dL'),
            numeric('Total protein', '6.0', '8.3', 'g/dL'),
            numeric('Albumin', '3.5', '5.2', 'g/dL'),
            numeric('Globulin', '2.0', '3.5', 'g/dL'),
            numeric('Albumin / globulin ratio', '1.0', '2.2', ''),
            numeric('Total bilirubin', '0.2', '1.2', 'mg/dL'),
            numeric('Direct bilirubin', '0', '0.3', 'mg/dL'),
            numeric('Indirect bilirubin', '0.2', '0.9', 'mg/dL'),
            numeric('AST', '10', '40', 'U/L'),
            numeric('ALT', '7', '56', 'U/L'),
            numeric('Alkaline phosphatase', '44', '147', 'U/L'),
            numeric('Gamma glutamyl transferase', '9', '48', 'U/L'),
            numeric('Serum amylase', '30', '110', 'U/L'),
            numeric('Serum lipase', '13', '60', 'U/L'),
            numeric('Total cholesterol', '0', '200', 'mg/dL'),
            numeric('Triglycerides', '0', '150', 'mg/dL'),
            numeric('HDL cholesterol', '40', '60', 'mg/dL'),
            numeric('Total cholesterol / HDL ratio', '0', '5', ''),
            numeric('Sodium', '135', '145', 'mmol/L'),
            numeric('Potassium', '3.5', '5.1', 'mmol/L'),
            numeric('Chloride', '98', '107', 'mmol/L'),
            numeric('Lactate dehydrogenase', '140', '280', 'U/L'),
            numeric('Serum magnesium', '1.7', '2.4', 'mg/dL'),
            numeric('Blood ammonia', '15', '45', 'umol/L'),
            interpretive('Neonatal bilirubin', 'Age-specific', 'Age-specific'),
            numeric('Serum lactate', '0.5', '2.2', 'mmol/L'),
            numeric('Creatine kinase', '20', '200', 'U/L'),
            numeric('CK-MB', '0', '25', 'U/L'),
            numeric('Cholinesterase', '5', '12', 'kU/L'),
            numeric('Carbon dioxide', '22', '29', 'mmol/L'),
            numeric('Serum iron', '60', '170', 'ug/dL'),
            interpretive('Acid phosphatase', 'Method-specific', 'Method-specific'),
        ],
    },
    {
        'sheet': 'URINE',
        'category': 'Urine and body fluids',
        'name': 'Urine examination',
        'prefix': 'URINE',
        'components': [
            text_only('Color'),
            text_only('Appearance'),
            numeric('pH (reaction)', '4.5', '8.0', ''),
            numeric('Specific gravity', '1.005', '1.030', ''),
            qualitative('Albumin', 'Negative'),
            qualitative('Glucose', 'Negative'),
            qualitative('Acetone', 'Negative'),
            qualitative('Bile salt', 'Negative'),
            qualitative('Bile pigment', 'Negative'),
            qualitative('Blood', 'Negative'),
            numeric('Pus cells', '0', '5', '/HPF'),
            numeric('Epithelial cells', '0', '5', '/HPF'),
            numeric('Red blood cells', '0', '2', '/HPF'),
            qualitative('Casts', 'Not seen'),
            qualitative('Crystals', 'Not seen'),
            qualitative('Amorphous deposits', 'Not seen'),
            qualitative('Mucus', 'Not seen'),
            qualitative('Organisms', 'Not seen'),
            text_only('Others'),
        ],
    },
    {
        'sheet': 'Stool',
        'category': 'Urine and body fluids',
        'name': 'Stool examination',
        'prefix': 'STOOL',
        'components': [
            text_only('Color'),
            text_only('Consistency'),
            numeric('pH (reaction)', '5.5', '7.5', ''),
            qualitative('Mucus', 'Negative'),
            qualitative('Occult blood', 'Negative'),
            qualitative('Frank blood', 'Negative'),
            qualitative('Worms', 'Not seen'),
            numeric('Pus cells', '0', '5', '/HPF'),
            numeric('Red blood cells', '0', '2', '/HPF'),
            qualitative('Vegetable cells', 'Not seen'),
            qualitative('Ova', 'Not seen'),
            qualitative('Cysts', 'Not seen'),
            qualitative('Trophozoites', 'Not seen'),
            qualitative('Larvae', 'Not seen'),
            qualitative('Fat globules', 'Negative'),
            text_only('Others'),
        ],
    },
    {
        'sheet': 'SEMEN',
        'category': 'Urine and body fluids',
        'name': 'Semen analysis',
        'prefix': 'SEMEN',
        'components': [
            text_only('Abstinence period'),
            text_only('Color'),
            numeric('Volume', '1.5', '6.0', 'mL'),
            text_only('Viscosity'),
            numeric('pH (reaction)', '7.2', '8.0', ''),
            numeric('Liquefaction time', '20', '60', 'min'),
            interpretive('Fructose', 'Positive'),
            numeric('Sperm concentration', '15', '300', 'million/mL'),
            numeric('Progressive motility', '32', '100', '%'),
            text_only('Sluggish motility'),
            text_only('Non-motile sperm'),
            text_only('Pus cells'),
            text_only('Spermatocytes'),
            numeric('Normal morphology', '4', '100', '%'),
            text_only('Giant head forms'),
            text_only('Pin-headed forms'),
            text_only('Double-headed forms'),
            text_only('Double-tailed forms'),
            text_only('Short-tailed forms'),
            text_only('Remark'),
        ],
    },
    {
        'sheet': 'SERO',
        'category': 'Serology and immunology',
        'name': 'Serology panel',
        'prefix': 'SERO',
        'components': [
            qualitative('Rheumatoid factor', 'Negative'),
            numeric('Anti-streptolysin O (ASO)', '0', '200', 'IU/mL'),
            numeric('C-reactive protein', '0', '5', 'mg/L'),
            qualitative('Antinuclear antibody (ANA)', 'Negative'),
            qualitative('Helicobacter pylori antibody', 'Negative'),
            qualitative('Brucella abortus antibody', 'Negative'),
            qualitative('Brucella melitensis antibody', 'Negative'),
            qualitative('Widal Typhi O', 'Negative'),
            qualitative('Widal Typhi H', 'Negative'),
            qualitative('Widal Paratyphi AH', 'Negative'),
            qualitative('Widal Paratyphi BH', 'Negative'),
            qualitative('Tuberculosis IgG', 'Negative'),
            qualitative('Tuberculosis IgM', 'Negative'),
            qualitative('HBsAg', 'Negative'),
            qualitative('Anti-HCV', 'Negative'),
        ],
    },
    {
        'sheet': 'HHHV',
        'category': 'Serology and immunology',
        'name': 'Viral screen',
        'prefix': 'VIRAL',
        'components': [
            qualitative('VDRL / RPR', 'Non-reactive'),
            qualitative('HIV 1 and 2 antibody', 'Non-reactive'),
            qualitative('HBsAg', 'Negative'),
            qualitative('Anti-HCV', 'Negative'),
        ],
    },
    {
        'sheet': 'SERO 1',
        'category': 'Serology and immunology',
        'name': 'Extended serology',
        'prefix': 'SEROX',
        'components': [
            qualitative('Brucella abortus antibody', 'Negative'),
            qualitative('Brucella melitensis antibody', 'Negative'),
            qualitative('Widal Typhi O', 'Negative'),
            qualitative('Widal Typhi H', 'Negative'),
            qualitative('Widal Paratyphi AH', 'Negative'),
            qualitative('Widal Paratyphi BH', 'Negative'),
            qualitative('Toxoplasma antibody', 'Negative'),
            qualitative('Treponema antibody', 'Negative'),
            qualitative('Helicobacter pylori antibody', 'Negative'),
            qualitative('Antinuclear antibody (ANA)', 'Negative'),
            qualitative('Tuberculosis IgG', 'Negative'),
            qualitative('Tuberculosis IgM', 'Negative'),
        ],
    },
    {
        'sheet': 'IGE',
        'category': 'Serology and immunology',
        'name': 'Total IgE',
        'prefix': 'IGE',
        'components': [
            numeric('Total IgE', '0', '100', 'IU/mL'),
        ],
    },
    {
        'sheet': 'MANTOUX',
        'category': 'Serology and immunology',
        'name': 'Mantoux test',
        'prefix': 'MANTOUX',
        'components': [
            qualitative('Mantoux result', 'Negative'),
        ],
    },
    {
        'sheet': 'THROAT',
        'category': 'Microbiology',
        'name': 'Throat culture and sensitivity',
        'prefix': 'THROAT',
        'components': [
            text_only('Gram stain comment'),
            text_only('Culture result'),
            text_only('Amoxycillin'),
            text_only('Cloxacillin'),
            text_only('Erythromycin'),
            text_only('Tetracycline'),
            text_only('Penicillin'),
            text_only('Cotrimoxazole'),
            text_only('Ciprofloxacin'),
            text_only('Cephalosporin'),
        ],
    },
    {
        'sheet': 'FLUID',
        'category': 'Urine and body fluids',
        'name': 'Fluid analysis',
        'prefix': 'FLUID',
        'components': [
            text_only('Appearance'),
            numeric('Quantity', '0', '0', 'mL'),
            text_only('Reaction'),
            text_only('Cobweb'),
            text_only('Protein', 'g/dL'),
            text_only('Glucose', 'mg/dL'),
            text_only('Cell count'),
            text_only('Differential count'),
            text_only('RBC observation'),
            qualitative("Gram stain", 'No organisms'),
            qualitative("AFB stain", 'Negative'),
        ],
    },
    {
        'sheet': 'BLOOD',
        'category': 'Microbiology',
        'name': 'Blood culture and sensitivity',
        'prefix': 'BLOODC',
        'components': [
            qualitative('Blood culture', 'No growth'),
            text_only('Organism identification'),
            text_only('Amoxydar'),
            text_only('Cephalexin'),
            text_only('Ciprofloxacin'),
            text_only('Clindamycin'),
            text_only('Cloxacillin'),
            text_only('Cotrimoxazole'),
            text_only('Erythromycin'),
            text_only('Tetracycline'),
        ],
    },
    {
        'sheet': 'GTT',
        'category': 'Chemistry',
        'name': 'Glucose tolerance test',
        'prefix': 'GTT',
        'components': [
            numeric('Fasting blood glucose', '70', '99', 'mg/dL'),
            interpretive('30-minute blood glucose', 'Protocol-specific', 'Protocol-specific'),
            interpretive('1-hour blood glucose', 'Protocol-specific', 'Protocol-specific'),
            interpretive('90-minute blood glucose', 'Protocol-specific', 'Protocol-specific'),
            interpretive('2-hour blood glucose', 'Protocol-specific', 'Protocol-specific'),
        ],
    },
    {
        'sheet': 'FNAC',
        'category': 'Pathology and cytology',
        'name': 'FNAC report',
        'prefix': 'FNAC',
        'components': [
            interpretive('FNAC report', 'Reported'),
        ],
    },
    {
        'sheet': '24 HR',
        'category': 'Urine and body fluids',
        'name': '24-hour urine protein',
        'prefix': 'UR24',
        'components': [
            numeric('Total urine quantity (24 hours)', '600', '2500', 'mL/24h'),
            numeric('Urine protein (24 hours)', '0', '150', 'mg/24h'),
        ],
    },
    {
        'sheet': 'AFB',
        'category': 'Microbiology',
        'name': 'Sputum for AFB',
        'prefix': 'AFB',
        'components': [
            qualitative('Sputum for AFB', 'Negative'),
        ],
    },
    {
        'sheet': 'GRAM ST',
        'category': 'Microbiology',
        'name': 'Gram stain panel',
        'prefix': 'GRAM',
        'components': [
            text_only('Pus cells'),
            text_only('Epithelial cells'),
            text_only('Mononuclear cells'),
            text_only('Gram positive cocci'),
            text_only('Gram negative bacilli'),
            qualitative('AFB stain', 'Negative'),
        ],
    },
    {
        'sheet': 'HCG',
        'category': 'Endocrinology',
        'name': 'Quantitative hCG',
        'prefix': 'HCGQ',
        'components': [
            numeric('Beta hCG', '0', '5', 'mIU/mL'),
        ],
    },
    {
        'sheet': 'PREG',
        'category': 'Endocrinology',
        'name': 'Pregnancy test',
        'prefix': 'PREG',
        'components': [
            qualitative('Urine pregnancy test', 'Negative'),
        ],
    },
    {
        'sheet': 'T.F.T',
        'category': 'Endocrinology',
        'name': 'Thyroid function test',
        'prefix': 'TFT',
        'components': [
            numeric('Total T3', '1.1', '2.9', 'nmol/L'),
            numeric('Total T4', '60', '150', 'nmol/L'),
            numeric('TSH', '0.4', '4.0', 'mIU/L'),
        ],
    },
    {
        'sheet': 'VSG',
        'category': 'Hematology',
        'name': 'VSG / ESR',
        'prefix': 'VSG',
        'components': [
            numeric('Erythrocyte sedimentation rate (ESR)', '0', '20', 'mm/hr'),
        ],
    },
    {
        'sheet': 'URI CS',
        'category': 'Microbiology',
        'name': 'Pus culture and sensitivity',
        'prefix': 'PUSCS',
        'components': [
            text_only('Culture result'),
            *ANTIBIOTIC_SENSITIVITY_COMPONENTS,
        ],
    },
    {
        'sheet': 'Testost',
        'category': 'Endocrinology',
        'name': 'Testosterone and PSA',
        'prefix': 'ANDRO',
        'components': [
            interpretive('Total testosterone', 'Adult male 300', '1000'),
            numeric('Prostate-specific antigen (PSA)', '0', '4', 'ng/mL'),
        ],
    },
    {
        'sheet': 'Hurmon',
        'category': 'Endocrinology',
        'name': 'Hormonal tests',
        'prefix': 'HORMONE',
        'components': [
            interpretive('Luteinizing hormone (LH)', 'Adult male 1.7', '8.6'),
            interpretive('Follicle-stimulating hormone (FSH)', 'Adult male 1.5', '12.4'),
            interpretive('Prolactin', 'Adult male 4', '15'),
        ],
    },
    {
        'sheet': 'URSC',
        'category': 'Microbiology',
        'name': 'Stool culture',
        'prefix': 'STOOLC',
        'components': [
            qualitative('Stool culture', 'No growth'),
        ],
    },
    {
        'sheet': 'EAR Culture',
        'category': 'Microbiology',
        'name': 'Ear culture and sensitivity',
        'prefix': 'EARC',
        'components': [
            text_only('Culture result'),
            *ANTIBIOTIC_SENSITIVITY_COMPONENTS,
        ],
    },
    {
        'sheet': 'EAR Swab',
        'category': 'Microbiology',
        'name': 'Ear swab gram stain',
        'prefix': 'EARSWAB',
        'components': [
            text_only('Ear swab comment'),
        ],
    },
    {
        'sheet': 'H.PYLORI',
        'category': 'Serology and immunology',
        'name': 'H. pylori IgG',
        'prefix': 'HPYL',
        'components': [
            qualitative('H. pylori IgG', 'Negative'),
        ],
    },
    {
        'sheet': 'TOXO IGG',
        'category': 'Serology and immunology',
        'name': 'Toxoplasma panel',
        'prefix': 'TOXO',
        'components': [
            qualitative('Toxoplasma IgG', 'Negative'),
            qualitative('Toxoplasma IgM', 'Negative'),
        ],
    },
    {
        'sheet': 'RUBILLA IGG',
        'category': 'Serology and immunology',
        'name': 'Rubella panel',
        'prefix': 'RUBELLA',
        'components': [
            interpretive('Rubella IgG', 'Immune', 'Immune'),
            qualitative('Rubella IgM', 'Negative'),
        ],
    },
    {
        'sheet': 'HIV ELISA',
        'category': 'Serology and immunology',
        'name': 'HIV ELISA',
        'prefix': 'HIVE',
        'components': [
            qualitative('HIV antibody screen', 'Non-reactive'),
        ],
    },
    {
        'sheet': 'HCV ELISA',
        'category': 'Serology and immunology',
        'name': 'HCV ELISA',
        'prefix': 'HCVE',
        'components': [
            qualitative('Anti-HCV ELISA', 'Non-reactive'),
        ],
    },
    {
        'sheet': 'HBV ELISA',
        'category': 'Serology and immunology',
        'name': 'HBV ELISA',
        'prefix': 'HBVE',
        'components': [
            qualitative('HBV ELISA screen', 'Negative'),
        ],
    },
    {
        'sheet': 'HBE ELISA',
        'category': 'Serology and immunology',
        'name': 'HBe ELISA',
        'prefix': 'HBEE',
        'components': [
            qualitative('HBeAg', 'Negative'),
        ],
    },
    {
        'sheet': 'HBS ELISA',
        'category': 'Serology and immunology',
        'name': 'HBs ELISA',
        'prefix': 'HBSE',
        'components': [
            qualitative('HBsAg ELISA', 'Negative'),
        ],
    },
    {
        'sheet': 'G6PD',
        'category': 'Hematology',
        'name': 'G6PD screen',
        'prefix': 'G6PD',
        'components': [
            interpretive('G6PD status', 'Normal', 'Normal'),
        ],
    },
]


PROFILE_BLUEPRINT = [
    {
        'name': 'Fibrile profile',
        'components': [
            text_only('CBC with ESR'),
            qualitative('Malaria parasite smear', 'Negative'),
            numeric('Total bilirubin', '0.2', '1.2', 'mg/dL'),
            qualitative('Brucella serology', 'Negative'),
            qualitative('Widal screen', 'Negative'),
            text_only('Urine routine'),
        ],
    },
    {
        'name': 'Lipid profile',
        'components': [
            numeric('Total cholesterol', '0', '200', 'mg/dL'),
            numeric('Triglycerides', '0', '150', 'mg/dL'),
            numeric('HDL cholesterol', '40', '60', 'mg/dL'),
            numeric('LDL cholesterol', '0', '100', 'mg/dL'),
            numeric('VLDL cholesterol', '5', '40', 'mg/dL'),
            numeric('Total cholesterol / HDL ratio', '0', '5', ''),
        ],
    },
    {
        'name': 'Liver function test',
        'components': [
            numeric('Total protein', '6.0', '8.3', 'g/dL'),
            numeric('Albumin', '3.5', '5.2', 'g/dL'),
            numeric('Globulin', '2.0', '3.5', 'g/dL'),
            numeric('Albumin / globulin ratio', '1.0', '2.2', ''),
            numeric('Total bilirubin', '0.2', '1.2', 'mg/dL'),
            numeric('AST', '10', '40', 'U/L'),
            numeric('ALT', '7', '56', 'U/L'),
            numeric('Alkaline phosphatase', '44', '147', 'U/L'),
            numeric('Gamma glutamyl transferase', '9', '48', 'U/L'),
        ],
    },
    {
        'name': 'Hematology profile',
        'components': [
            numeric('Hemoglobin', '12', '17', 'g/dL'),
            numeric('Hematocrit', '36', '50', '%'),
            numeric('Red blood cell count', '4.2', '5.9', '10^12/L'),
            numeric('White blood cell count', '4', '11', '10^9/L'),
            text_only('Differential WBC count'),
            numeric('MCV', '80', '100', 'fL'),
            numeric('MCH', '27', '33', 'pg'),
            numeric('MCHC', '32', '36', 'g/dL'),
            numeric('Platelet count', '150', '450', '10^9/L'),
        ],
    },
    {
        'name': 'Hypertension profile',
        'components': [
            numeric('Random blood glucose', '70', '140', 'mg/dL'),
            numeric('Total cholesterol', '0', '200', 'mg/dL'),
            numeric('Triglycerides', '0', '150', 'mg/dL'),
            numeric('HDL cholesterol', '40', '60', 'mg/dL'),
            numeric('VLDL cholesterol', '5', '40', 'mg/dL'),
            numeric('Total cholesterol / HDL ratio', '0', '5', ''),
            numeric('Serum creatinine', '0.6', '1.3', 'mg/dL'),
            numeric('Blood urea', '15', '45', 'mg/dL'),
            numeric('Serum uric acid', '3.5', '7.2', 'mg/dL'),
            text_only('Electrolyte panel'),
            text_only('Urine examination'),
        ],
    },
    {
        'name': 'Total body profile',
        'components': [
            text_only('CBC with ESR'),
            interpretive('Blood group and Rh', 'Reported'),
            qualitative('VDRL / RPR', 'Non-reactive'),
            numeric('Serum creatinine', '0.6', '1.3', 'mg/dL'),
            numeric('Blood urea', '15', '45', 'mg/dL'),
            numeric('Serum uric acid', '3.5', '7.2', 'mg/dL'),
            text_only('Electrolyte panel'),
            numeric('Total cholesterol', '0', '200', 'mg/dL'),
            numeric('Triglycerides', '0', '150', 'mg/dL'),
            numeric('HDL cholesterol', '40', '60', 'mg/dL'),
            numeric('LDL cholesterol', '0', '100', 'mg/dL'),
            numeric('VLDL cholesterol', '5', '40', 'mg/dL'),
            numeric('Total cholesterol / HDL ratio', '0', '5', ''),
            numeric('Random blood glucose', '70', '140', 'mg/dL'),
            numeric('Total protein', '6.0', '8.3', 'g/dL'),
            numeric('Albumin', '3.5', '5.2', 'g/dL'),
            numeric('Globulin', '2.0', '3.5', 'g/dL'),
            numeric('Albumin / globulin ratio', '1.0', '2.2', ''),
            numeric('Total bilirubin', '0.2', '1.2', 'mg/dL'),
            numeric('AST', '10', '40', 'U/L'),
            numeric('ALT', '7', '56', 'U/L'),
            numeric('Alkaline phosphatase', '44', '147', 'U/L'),
            numeric('Gamma glutamyl transferase', '9', '48', 'U/L'),
            numeric('Serum calcium', '8.5', '10.5', 'mg/dL'),
            numeric('Serum phosphorus', '2.5', '4.5', 'mg/dL'),
            numeric('Lactate dehydrogenase', '140', '280', 'U/L'),
            text_only('Urine examination'),
            text_only('Stool examination'),
        ],
    },
    {
        'name': 'Cardiac profile',
        'components': [
            numeric('Random blood glucose', '70', '140', 'mg/dL'),
            numeric('Serum creatinine', '0.6', '1.3', 'mg/dL'),
            numeric('Blood urea', '15', '45', 'mg/dL'),
            numeric('Serum uric acid', '3.5', '7.2', 'mg/dL'),
            text_only('Electrolyte panel'),
            numeric('Total cholesterol', '0', '200', 'mg/dL'),
            numeric('Triglycerides', '0', '150', 'mg/dL'),
            numeric('HDL cholesterol', '40', '60', 'mg/dL'),
            numeric('LDL cholesterol', '0', '100', 'mg/dL'),
            numeric('VLDL cholesterol', '5', '40', 'mg/dL'),
            numeric('Total cholesterol / HDL ratio', '0', '5', ''),
            numeric('AST', '10', '40', 'U/L'),
            numeric('ALT', '7', '56', 'U/L'),
            numeric('Lactate dehydrogenase', '140', '280', 'U/L'),
            numeric('Creatine kinase', '20', '200', 'U/L'),
            numeric('CK-MB', '0', '25', 'U/L'),
            text_only('Urine examination'),
        ],
    },
    {
        'name': 'Renal profile',
        'components': [
            numeric('Random blood glucose', '70', '140', 'mg/dL'),
            numeric('Serum creatinine', '0.6', '1.3', 'mg/dL'),
            numeric('Blood urea', '15', '45', 'mg/dL'),
            numeric('Serum uric acid', '3.5', '7.2', 'mg/dL'),
            text_only('Electrolyte panel'),
            numeric('Total protein', '6.0', '8.3', 'g/dL'),
            numeric('Albumin', '3.5', '5.2', 'g/dL'),
            numeric('Globulin', '2.0', '3.5', 'g/dL'),
            numeric('Albumin / globulin ratio', '1.0', '2.2', ''),
            numeric('Serum calcium', '8.5', '10.5', 'mg/dL'),
            numeric('Serum phosphorus', '2.5', '4.5', 'mg/dL'),
            numeric('Alkaline phosphatase', '44', '147', 'U/L'),
            text_only('Urine examination'),
        ],
    },
    {
        'name': 'Rheumatic profile',
        'components': [
            numeric('Random blood glucose', '70', '140', 'mg/dL'),
            numeric('Serum uric acid', '3.5', '7.2', 'mg/dL'),
            qualitative('Antinuclear antibody (ANA)', 'Negative'),
            numeric('Anti-streptolysin O (ASO)', '0', '200', 'IU/mL'),
            numeric('C-reactive protein', '0', '5', 'mg/L'),
            qualitative('Rheumatoid factor', 'Negative'),
            text_only('Urine examination'),
        ],
    },
    {
        'name': 'Surgical profile',
        'components': [
            text_only('CBC with ESR'),
            numeric('Random blood glucose', '70', '140', 'mg/dL'),
            numeric('Blood urea', '15', '45', 'mg/dL'),
            numeric('Serum creatinine', '0.6', '1.3', 'mg/dL'),
            numeric('AST', '10', '40', 'U/L'),
            numeric('ALT', '7', '56', 'U/L'),
            qualitative('HBsAg', 'Negative'),
            qualitative('Anti-HCV', 'Negative'),
            qualitative('HIV antibody screen', 'Non-reactive'),
            interpretive('Blood group and Rh', 'Reported'),
            text_only('Bleeding and clotting time'),
            text_only('Urine examination'),
        ],
    },
]


def validate_workbook():
    if not WORKBOOK_PATH.exists():
        raise FileNotFoundError(f'Workbook not found: {WORKBOOK_PATH}')
    workbook = xlrd.open_workbook(str(WORKBOOK_PATH))
    workbook_sheets = set(workbook.sheet_names())
    required_sheets = {panel['sheet'] for panel in PANEL_BLUEPRINT} | {'profile'}
    missing = sorted(required_sheets - workbook_sheets)
    if missing:
        raise ValueError(f'Workbook is missing expected sheets: {", ".join(missing)}')
    return workbook


def build_catalog():
    validate_workbook()
    records = []
    category_order = defaultdict(int)

    def add_panel(category: str, name: str, prefix: str, components: list[dict]):
        category_order[category] += 1
        panel_sort_order = category_order[category] * 100
        records.append(
            {
                'name': name,
                'display_name': name,
                'category': category,
                'is_panel': True,
                'parent_name': None,
                'sort_order': panel_sort_order,
                'normal_range_from': '',
                'normal_range_to': '',
                'unit': '',
            }
        )
        for index, component in enumerate(components, start=1):
            records.append(
                {
                    'name': f'{prefix} - {component["display_name"]}',
                    'display_name': component['display_name'],
                    'category': category,
                    'is_panel': False,
                    'parent_name': name,
                    'sort_order': panel_sort_order + index,
                    'normal_range_from': component['normal_range_from'],
                    'normal_range_to': component['normal_range_to'],
                    'unit': component['unit'],
                }
            )

    for panel in PANEL_BLUEPRINT:
        add_panel(panel['category'], panel['name'], panel['prefix'], panel['components'])

    for index, panel in enumerate(PROFILE_BLUEPRINT, start=1):
        add_panel('Profiles', panel['name'], f'PROFILE-{index}', panel['components'])

    names = [record['name'] for record in records]
    if len(names) != len(set(names)):
        duplicates = sorted({name for name in names if names.count(name) > 1})
        raise ValueError(f'Duplicate lab test names detected: {", ".join(duplicates[:10])}')
    return records


class Command(BaseCommand):
    help = 'Seed laboratory tests from the uploaded legacy spreadsheet using updated adult reference intervals.'

    def handle(self, *args, **options):
        records = build_catalog()
        created = 0
        updated = 0
        active_names = {record['name'] for record in records}
        panels_by_name = {}

        for record in records:
            if not record['is_panel']:
                continue
            test, was_created = LabTest.objects.update_or_create(
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
            panels_by_name[record['name']] = test
            created += int(was_created)
            updated += int(not was_created)

        for record in records:
            if record['is_panel']:
                continue
            test, was_created = LabTest.objects.update_or_create(
                name=record['name'],
                defaults={
                    'display_name': record['display_name'],
                    'category': record['category'],
                    'is_panel': False,
                    'parent_panel': panels_by_name.get(record['parent_name']),
                    'sort_order': record['sort_order'],
                    'normal_range_from': record['normal_range_from'],
                    'normal_range_to': record['normal_range_to'],
                    'unit': record['unit'],
                    'is_active': True,
                },
            )
            created += int(was_created)
            updated += int(not was_created)

        deactivated = LabTest.objects.exclude(name__in=active_names).filter(is_active=True).update(is_active=False)

        self.stdout.write(
            self.style.SUCCESS(
                f'Seeded {len(records)} laboratory tests from {WORKBOOK_PATH.name}. Created {created}, updated {updated}, deactivated {deactivated}.'
            )
        )
