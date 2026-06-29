from __future__ import annotations

from dataclasses import dataclass


class Role:
    SUPER_ADMIN = 'super_admin'
    RECEPTIONIST = 'receptionist'
    DOCTOR = 'doctor'
    LABORATORY = 'laboratory'
    PHARMACIST = 'pharmacist'
    MIDWIFE = 'midwife'
    VACCINATOR = 'vaccinator'
    MALNUTRITION = 'malnutrition'


ROLE_CHOICES = (
    (Role.SUPER_ADMIN, 'Super admin'),
    (Role.RECEPTIONIST, 'Receptionist'),
    (Role.DOCTOR, 'Doctor'),
    (Role.LABORATORY, 'Laboratory'),
    (Role.PHARMACIST, 'Pharmacist'),
    (Role.MIDWIFE, 'Midwife'),
    (Role.VACCINATOR, 'Vaccinator'),
    (Role.MALNUTRITION, 'Malnutrition'),
)


@dataclass(frozen=True)
class PermissionDefinition:
    code: str
    label: str
    group: str
    default_roles: tuple[str, ...]


PERMISSION_DEFINITIONS = (
    PermissionDefinition('users.manage', 'Manage users and permissions', 'Administration', (Role.SUPER_ADMIN,)),
    PermissionDefinition('patients.view', 'View patients', 'Reception', (Role.SUPER_ADMIN, Role.RECEPTIONIST, Role.DOCTOR, Role.LABORATORY, Role.PHARMACIST, Role.MIDWIFE, Role.VACCINATOR, Role.MALNUTRITION)),
    PermissionDefinition('patients.register', 'Register patients', 'Reception', (Role.SUPER_ADMIN, Role.RECEPTIONIST)),
    PermissionDefinition('payments.view', 'View payments', 'Finance', (Role.SUPER_ADMIN, Role.RECEPTIONIST)),
    PermissionDefinition('payments.approve', 'Approve pending payments', 'Finance', (Role.SUPER_ADMIN, Role.RECEPTIONIST)),
    PermissionDefinition('documents.prescription.create', 'Create and print prescriptions', 'Doctor', (Role.SUPER_ADMIN, Role.DOCTOR)),
    PermissionDefinition('documents.lab_order.create', 'Create and print lab orders', 'Doctor', (Role.SUPER_ADMIN, Role.DOCTOR)),
    PermissionDefinition('documents.lab_bill.create', 'Create and print lab bills', 'Laboratory', (Role.SUPER_ADMIN, Role.LABORATORY)),
    PermissionDefinition('documents.medicine_bill.create', 'Create and print medicine bills', 'Pharmacy', (Role.SUPER_ADMIN, Role.PHARMACIST)),
    PermissionDefinition('stock.manage', 'Manage medicine stock', 'Pharmacy', (Role.SUPER_ADMIN, Role.PHARMACIST)),
    PermissionDefinition('documents.ultrasound.create', 'Create and print ultrasound bills/results', 'Midwife', (Role.SUPER_ADMIN, Role.MIDWIFE)),
    PermissionDefinition('documents.vaccination.create', 'Create and print vaccination papers', 'Vaccination', (Role.SUPER_ADMIN, Role.VACCINATOR)),
    PermissionDefinition('documents.rutf.create', 'Create and print RUTF papers', 'Malnutrition', (Role.SUPER_ADMIN, Role.MALNUTRITION)),
)

ALL_PERMISSION_CODES = tuple(permission.code for permission in PERMISSION_DEFINITIONS)


def default_permissions_for_role(role: str) -> list[str]:
    return [
        permission.code
        for permission in PERMISSION_DEFINITIONS
        if role in permission.default_roles
    ]
