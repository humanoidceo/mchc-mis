from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from datetime import timedelta
from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import ProtectedError
from django.utils import timezone
from rest_framework import serializers

from accounts.models import Employee, StaffProfile
from clinic.models import ClinicalDocument, Expense, Medicine as ClinicMedicine, Patient, Payment, PrivateDocument, SalaryAdvance, SalaryPayment
from pharmacy.models import Medicine as PharmacyMedicine, Sale

User = get_user_model()


@dataclass(frozen=True)
class TrashModelConfig:
    key: str
    model: type
    label: str


SOFT_DELETE_MODELS: tuple[TrashModelConfig, ...] = (
    TrashModelConfig('patient', Patient, 'Patient'),
    TrashModelConfig('payment', Payment, 'Payment'),
    TrashModelConfig('expense', Expense, 'Expense'),
    TrashModelConfig('salary_advance', SalaryAdvance, 'Salary advance'),
    TrashModelConfig('salary_payment', SalaryPayment, 'Salary payment'),
    TrashModelConfig('clinical_document', ClinicalDocument, 'Clinical document'),
    TrashModelConfig('private_document', PrivateDocument, 'Private document'),
    TrashModelConfig('clinic_medicine', ClinicMedicine, 'Clinic medicine'),
    TrashModelConfig('pharmacy_medicine', PharmacyMedicine, 'Pharmacy medicine'),
    TrashModelConfig('pharmacy_sale', Sale, 'Pharmacy sale'),
    TrashModelConfig('employee', Employee, 'Employee'),
)
SOFT_DELETE_MODEL_MAP = {entry.key: entry for entry in SOFT_DELETE_MODELS}


def _retention_days_for_user(user) -> int:
    profile = getattr(user, 'staff_profile', None)
    return max(1, int(getattr(profile, 'trash_retention_days', 30) or 30))


def _describe_object(model_key: str, obj) -> str:
    if model_key == 'patient':
        full_name = f'{obj.first_name} {obj.last_name}'.strip()
        return f'{obj.registration_number} - {full_name}'.strip(' -')
    if model_key == 'payment':
        return f'{obj.service} - {obj.patient.first_name} {obj.patient.last_name}'.strip()
    if model_key == 'expense':
        return obj.name
    if model_key == 'salary_advance':
        return f'{obj.employee.first_name} {obj.employee.last_name} - {obj.amount}'
    if model_key == 'salary_payment':
        return f'{obj.employee.first_name} {obj.employee.last_name} - {obj.afghan_year}'
    if model_key == 'clinical_document':
        return obj.title
    if model_key == 'private_document':
        return obj.title
    if model_key == 'clinic_medicine':
        return obj.name
    if model_key == 'pharmacy_medicine':
        return obj.name
    if model_key == 'pharmacy_sale':
        return obj.bill_no or f'Sale #{obj.pk}'
    if model_key == 'employee':
        return f'{obj.first_name} {obj.last_name}'.strip()
    return str(obj)


def _family_planning_items_from_payload(payload) -> list[tuple[int, int]]:
    if not isinstance(payload, dict):
        raise serializers.ValidationError({'payload': 'Invalid family planning payload.'})
    items = payload.get('items')
    if not isinstance(items, list):
        raise serializers.ValidationError({'payload': 'No family planning items were found in this order.'})
    rows: list[tuple[int, int]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        medicine_id = item.get('medicine')
        try:
            quantity = int(item.get('quantity') or 0)
        except (TypeError, ValueError):
            quantity = 0
        if isinstance(medicine_id, int) and quantity > 0:
            rows.append((medicine_id, quantity))
    return rows


def _lock_family_planning_medicines(pharmacist, item_rows: list[tuple[int, int]]) -> dict[int, PharmacyMedicine]:
    medicine_ids = [medicine_id for medicine_id, _quantity in item_rows]
    medicines = {
        medicine.id: medicine
        for medicine in PharmacyMedicine.all_objects.select_for_update().filter(
            pharmacist=pharmacist,
            pk__in=medicine_ids,
            generic_name__iexact='Family Planning',
            deleted_at__isnull=True,
        )
    }
    for medicine_id, _quantity in item_rows:
        if medicine_id not in medicines:
            raise serializers.ValidationError({'medicine': f'Family planning stock item #{medicine_id} was not found.'})
    return medicines


def _restore_family_planning_stock(pharmacist, payload) -> None:
    item_rows = _family_planning_items_from_payload(payload)
    medicines = _lock_family_planning_medicines(pharmacist, item_rows)
    for medicine_id, quantity in item_rows:
        medicine = medicines[medicine_id]
        medicine.quantity += quantity
        medicine.save(update_fields=['quantity', 'sell_price', 'updated_at'])


def _deduct_family_planning_stock(pharmacist, payload) -> None:
    item_rows = _family_planning_items_from_payload(payload)
    medicines = _lock_family_planning_medicines(pharmacist, item_rows)
    for medicine_id, quantity in item_rows:
        medicine = medicines[medicine_id]
        if quantity > medicine.quantity:
            raise serializers.ValidationError({'medicine': f'Only {medicine.quantity} available for {medicine.name}.'})
    for medicine_id, quantity in item_rows:
        medicine = medicines[medicine_id]
        medicine.quantity -= quantity
        medicine.save(update_fields=['quantity', 'sell_price', 'updated_at'])


def _soft_delete_patient(instance: Patient, user) -> None:
    instance.soft_delete(user=user)
    Payment.all_objects.filter(patient=instance, deleted_at__isnull=True).update(deleted_at=instance.deleted_at, deleted_by=user)
    ClinicalDocument.all_objects.filter(patient=instance, deleted_at__isnull=True).update(deleted_at=instance.deleted_at, deleted_by=user)


def _restore_patient(instance: Patient) -> None:
    instance.restore()
    Payment.all_objects.filter(patient=instance, deleted_at__isnull=False).update(deleted_at=None, deleted_by=None)
    ClinicalDocument.all_objects.filter(patient=instance, deleted_at__isnull=False).update(deleted_at=None, deleted_by=None)


def _soft_delete_salary_advance(instance: SalaryAdvance, user) -> None:
    instance.soft_delete(user=user)
    Expense.all_objects.filter(salary_advance=instance, deleted_at__isnull=True).update(deleted_at=instance.deleted_at, deleted_by=user)


def _restore_salary_advance(instance: SalaryAdvance) -> None:
    instance.restore()
    Expense.all_objects.filter(salary_advance=instance, deleted_at__isnull=False).update(deleted_at=None, deleted_by=None)


def _soft_delete_salary_payment(instance: SalaryPayment, user) -> None:
    instance.soft_delete(user=user)
    Expense.all_objects.filter(salary_payment=instance, deleted_at__isnull=True).update(deleted_at=instance.deleted_at, deleted_by=user)


def _restore_salary_payment(instance: SalaryPayment) -> None:
    instance.restore()
    Expense.all_objects.filter(salary_payment=instance, deleted_at__isnull=False).update(deleted_at=None, deleted_by=None)


def _soft_delete_sale(instance: Sale, user) -> None:
    if instance.deleted_at is not None:
        return
    for item in instance.items.select_related('medicine').all():
        medicine = PharmacyMedicine.all_objects.select_for_update().filter(
            pk=item.medicine_id,
            pharmacist=instance.pharmacist,
            deleted_at__isnull=True,
        ).first()
        if medicine is not None:
            medicine.quantity += item.quantity
            medicine.save(update_fields=['quantity', 'sell_price', 'updated_at'])
    instance.soft_delete(user=user)
    if instance.payment_id:
        payment = Payment.all_objects.filter(pk=instance.payment_id).first()
        if payment is not None and payment.deleted_at is None:
            payment.soft_delete(user=user)


def _restore_sale(instance: Sale) -> None:
    for item in instance.items.select_related('medicine').all():
        medicine = PharmacyMedicine.all_objects.select_for_update().filter(
            pk=item.medicine_id,
            pharmacist=instance.pharmacist,
            deleted_at__isnull=True,
        ).first()
        if medicine is None:
            raise serializers.ValidationError({'medicine': f'The stock item for {item.medicine_name} is missing.'})
        if item.quantity > medicine.quantity:
            raise serializers.ValidationError({'medicine': f'Only {medicine.quantity} available for {medicine.name}.'})
    for item in instance.items.select_related('medicine').all():
        medicine = PharmacyMedicine.all_objects.select_for_update().get(pk=item.medicine_id)
        medicine.quantity -= item.quantity
        medicine.save(update_fields=['quantity', 'sell_price', 'updated_at'])
    instance.restore()
    if instance.payment_id:
        payment = Payment.all_objects.filter(pk=instance.payment_id).first()
        if payment is not None and payment.deleted_at is not None:
            payment.restore()


def _soft_delete_clinical_document(instance: ClinicalDocument, user) -> None:
    if instance.deleted_at is not None:
        return
    payload = dict(instance.payload or {})
    if (
        instance.document_type == ClinicalDocument.DocumentType.FAMILY_PLANNING
        and payload.get('family_planning_record')
        and payload.get('pharmacy_status') == 'dispensed'
    ):
        _restore_family_planning_stock(user, payload)
    instance.soft_delete(user=user)
    if instance.payment_id:
        payment = Payment.all_objects.filter(pk=instance.payment_id).first()
        if payment is not None and payment.deleted_at is None:
            payment.soft_delete(user=user)


def _restore_clinical_document(instance: ClinicalDocument) -> None:
    payload = dict(instance.payload or {})
    if (
        instance.document_type == ClinicalDocument.DocumentType.FAMILY_PLANNING
        and payload.get('family_planning_record')
        and payload.get('pharmacy_status') == 'dispensed'
    ):
        _deduct_family_planning_stock(instance.deleted_by or instance.created_by, payload)
    instance.restore()
    if instance.payment_id:
        payment = Payment.all_objects.filter(pk=instance.payment_id).first()
        if payment is not None and payment.deleted_at is not None:
            payment.restore()


def _soft_delete_user(instance: User, user) -> None:
    profile = getattr(instance, 'staff_profile', None)
    if profile is not None and profile.deleted_at is not None:
        return
    instance.is_active = False
    instance.save(update_fields=['is_active'])
    if profile is not None:
        profile.deleted_at = timezone.now()
        profile.deleted_by = user
        profile.save(update_fields=['deleted_at', 'deleted_by', 'updated_at'])


def _restore_user(instance: User) -> None:
    profile = getattr(instance, 'staff_profile', None)
    instance.is_active = True
    instance.save(update_fields=['is_active'])
    if profile is not None:
        profile.deleted_at = None
        profile.deleted_by = None
        profile.save(update_fields=['deleted_at', 'deleted_by', 'updated_at'])


def cleanup_expired_trash() -> None:
    now = timezone.now()

    for config in SOFT_DELETE_MODELS:
        queryset = config.model.all_objects.deleted().select_related('deleted_by__staff_profile')
        for instance in queryset.iterator():
            deleted_by = getattr(instance, 'deleted_by', None)
            retention_days = _retention_days_for_user(deleted_by) if deleted_by else 30
            if instance.deleted_at and instance.deleted_at <= now - timedelta(days=retention_days):
                try:
                    instance.hard_delete()
                except ProtectedError:
                    continue

    expired_profiles = StaffProfile.objects.filter(deleted_at__isnull=False).select_related('user', 'deleted_by__staff_profile')
    for profile in expired_profiles.iterator():
        deleted_by = profile.deleted_by
        retention_days = _retention_days_for_user(deleted_by) if deleted_by else 30
        if profile.deleted_at and profile.deleted_at <= now - timedelta(days=retention_days):
            try:
                profile.user.delete()
            except ProtectedError:
                continue


def list_trash_items(user, *, page: int = 1, page_size: int = 10, query: str = '', model_key: str = '') -> dict[str, Any]:
    cleanup_expired_trash()
    items: list[dict[str, Any]] = []
    query_lower = query.strip().lower()

    for config in SOFT_DELETE_MODELS:
        if model_key and config.key != model_key:
            continue
        for instance in config.model.all_objects.deleted().filter(deleted_by=user).iterator():
            title = _describe_object(config.key, instance)
            if query_lower and query_lower not in title.lower() and query_lower not in config.label.lower():
                continue
            items.append(
                {
                    'model': config.key,
                    'model_label': config.label,
                    'id': instance.pk,
                    'title': title,
                    'deleted_at': instance.deleted_at,
                }
            )

    if not model_key or model_key == 'user':
        deleted_profiles = StaffProfile.objects.filter(deleted_by=user, deleted_at__isnull=False).select_related('user')
        for profile in deleted_profiles.iterator():
            person = profile.user.get_full_name() or profile.user.username
            if query_lower and query_lower not in person.lower() and query_lower not in 'user':
                continue
            items.append(
                {
                    'model': 'user',
                    'model_label': 'User',
                    'id': profile.user_id,
                    'title': person,
                    'deleted_at': profile.deleted_at,
                }
            )

    items.sort(key=lambda item: item['deleted_at'] or timezone.make_aware(datetime.min), reverse=True)
    total_count = len(items)
    start = max(0, (max(page, 1) - 1) * page_size)
    end = start + page_size
    return {
        'count': total_count,
        'results': items[start:end],
    }


def _get_soft_deleted_instance(model_key: str, record_id: int, user):
    config = SOFT_DELETE_MODEL_MAP.get(model_key)
    if config is None:
        raise serializers.ValidationError({'model': f'Unsupported trash item type: {model_key}.'})
    instance = config.model.all_objects.deleted().filter(pk=record_id, deleted_by=user).first()
    if instance is None:
        raise serializers.ValidationError({'detail': 'Trash item not found.'})
    return instance


def restore_trash_item(model_key: str, record_id: int, user) -> None:
    cleanup_expired_trash()
    with transaction.atomic():
        if model_key == 'user':
            profile = StaffProfile.objects.select_related('user').filter(user_id=record_id, deleted_by=user, deleted_at__isnull=False).first()
            if profile is None:
                raise serializers.ValidationError({'detail': 'Trash item not found.'})
            _restore_user(profile.user)
            return

        instance = _get_soft_deleted_instance(model_key, record_id, user)
        if model_key == 'patient':
            _restore_patient(instance)
        elif model_key == 'salary_advance':
            _restore_salary_advance(instance)
        elif model_key == 'salary_payment':
            _restore_salary_payment(instance)
        elif model_key == 'pharmacy_sale':
            _restore_sale(instance)
        elif model_key == 'clinical_document':
            _restore_clinical_document(instance)
        else:
            instance.restore()


def permanently_delete_trash_item(model_key: str, record_id: int, user) -> None:
    cleanup_expired_trash()
    with transaction.atomic():
        if model_key == 'user':
            profile = StaffProfile.objects.select_related('user').filter(user_id=record_id, deleted_by=user, deleted_at__isnull=False).first()
            if profile is None:
                raise serializers.ValidationError({'detail': 'Trash item not found.'})
            try:
                profile.user.delete()
            except ProtectedError as exc:
                raise serializers.ValidationError({'detail': f'Cannot permanently delete this user yet: {exc}.'}) from exc
            return
        instance = _get_soft_deleted_instance(model_key, record_id, user)
        try:
            instance.hard_delete()
        except ProtectedError as exc:
            raise serializers.ValidationError({'detail': f'Cannot permanently delete this record yet: {exc}.'}) from exc


def soft_delete_instance(instance, user) -> None:
    with transaction.atomic():
        if isinstance(instance, Patient):
            _soft_delete_patient(instance, user)
        elif isinstance(instance, SalaryAdvance):
            _soft_delete_salary_advance(instance, user)
        elif isinstance(instance, SalaryPayment):
            _soft_delete_salary_payment(instance, user)
        elif isinstance(instance, Sale):
            _soft_delete_sale(instance, user)
        elif isinstance(instance, ClinicalDocument):
            _soft_delete_clinical_document(instance, user)
        elif isinstance(instance, User):
            _soft_delete_user(instance, user)
        else:
            instance.soft_delete(user=user)
