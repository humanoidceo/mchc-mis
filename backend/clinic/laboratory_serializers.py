from decimal import Decimal

from rest_framework import serializers

from .models import ClinicalDocument, LabTest, Patient


def lab_test_label(test: LabTest | None, fallback: str = '') -> str:
    if test is None:
        return fallback
    return str(test.display_name or test.name).strip()


def resolve_lab_test_reference(test_id: int | None, test_name: str) -> LabTest | None:
    if isinstance(test_id, int):
        test = LabTest.objects.select_related('parent_panel').filter(pk=test_id).first()
        if test is not None:
            return test
    normalized_name = str(test_name).strip()
    if normalized_name:
        return (
            LabTest.objects.select_related('parent_panel')
            .filter(name__iexact=normalized_name)
            .first()
            or LabTest.objects.select_related('parent_panel').filter(display_name__iexact=normalized_name).first()
        )
    return None


def build_ordered_item_snapshot(test: LabTest | None, test_name: str, instructions: str, cost: Decimal):
    label = lab_test_label(test, fallback=test_name) or test_name
    return {
        'test': test.id if test else None,
        'test_name': label,
        'full_name': test.name if test else label,
        'category': test.category if test else '',
        'is_panel': bool(test.is_panel) if test else False,
        'component_count': test.components.filter(is_active=True).count() if test and test.is_panel else 1,
        'instructions': instructions,
        'cost': str(cost),
    }


def build_result_item_snapshot(test: LabTest | None, test_name: str, instructions: str, result: str = ''):
    panel = test.parent_panel if test else None
    label = lab_test_label(test, fallback=test_name) or test_name
    return {
        'test': test.id if test else None,
        'test_name': label,
        'full_name': test.name if test else label,
        'panel_name': lab_test_label(panel) if panel else '',
        'instructions': instructions,
        'normal_range_from': test.normal_range_from if test else '',
        'normal_range_to': test.normal_range_to if test else '',
        'unit': test.unit if test else '',
        'result': result,
    }


def expand_lab_test_selection(test_id: int | None, test_name: str, instructions: str, cost: Decimal):
    test = resolve_lab_test_reference(test_id, test_name)
    ordered_item = build_ordered_item_snapshot(test, test_name, instructions, cost)

    if test is not None and test.is_panel:
        components = list(test.components.filter(is_active=True).order_by('sort_order', 'name'))
        if components:
            return ordered_item, [build_result_item_snapshot(component, component.name, instructions) for component in components]

    return ordered_item, [build_result_item_snapshot(test, test_name, instructions)]


def enrich_ordered_item(item):
    if not isinstance(item, dict):
        return item
    enriched = dict(item)
    test_id = enriched.get('test') if isinstance(enriched.get('test'), int) else None
    test_name = str(enriched.get('full_name') or enriched.get('test_name') or enriched.get('test') or '').strip()
    test = resolve_lab_test_reference(test_id, test_name)
    if test is None:
        if not str(enriched.get('test_name', '')).strip():
            enriched['test_name'] = test_name
        enriched['is_panel'] = bool(enriched.get('is_panel', False))
        enriched['component_count'] = int(enriched.get('component_count') or 1)
        return enriched
    enriched['test'] = test.id
    enriched['full_name'] = test.name
    enriched['test_name'] = lab_test_label(test, fallback=test.name)
    enriched['category'] = test.category
    enriched['is_panel'] = test.is_panel
    enriched['component_count'] = test.components.filter(is_active=True).count() if test.is_panel else 1
    return enriched


def enrich_result_item(item):
    if not isinstance(item, dict):
        return item
    enriched = dict(item)
    test_id = enriched.get('test') if isinstance(enriched.get('test'), int) else None
    test_name = str(enriched.get('full_name') or enriched.get('test_name') or enriched.get('test') or '').strip()
    test = resolve_lab_test_reference(test_id, test_name)
    if test is None:
        if not str(enriched.get('test_name', '')).strip():
            enriched['test_name'] = test_name
        if 'panel_name' not in enriched:
            enriched['panel_name'] = ''
        return enriched
    enriched['test'] = test.id
    enriched['full_name'] = test.name
    enriched['test_name'] = lab_test_label(test, fallback=test.name)
    enriched['panel_name'] = lab_test_label(test.parent_panel) if test.parent_panel else ''
    if not str(enriched.get('normal_range_from', '')).strip():
        enriched['normal_range_from'] = test.normal_range_from
    if not str(enriched.get('normal_range_to', '')).strip():
        enriched['normal_range_to'] = test.normal_range_to
    if not str(enriched.get('unit', '')).strip():
        enriched['unit'] = test.unit
    return enriched


def enrich_lab_bill_payload(payload):
    if not isinstance(payload, dict):
        return {}
    enriched = dict(payload)

    raw_ordered_items = enriched.get('ordered_items')
    raw_result_items = enriched.get('result_items')
    legacy_items = enriched.get('items')

    if isinstance(raw_ordered_items, list):
        enriched['ordered_items'] = [enrich_ordered_item(item) for item in raw_ordered_items]
    elif isinstance(legacy_items, list):
        enriched['ordered_items'] = [enrich_ordered_item(item) for item in legacy_items]
    else:
        enriched['ordered_items'] = []

    if isinstance(raw_result_items, list):
        enriched['result_items'] = [enrich_result_item(item) for item in raw_result_items]
    elif isinstance(legacy_items, list):
        enriched['result_items'] = [enrich_result_item(item) for item in legacy_items]
    else:
        enriched['result_items'] = []

    return enriched


class LaboratoryPatientSearchSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    registration_number = serializers.CharField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    age = serializers.IntegerField(allow_null=True)
    phone = serializers.CharField(allow_blank=True)


class LaboratoryOrderItemSerializer(serializers.Serializer):
    test = serializers.IntegerField(allow_null=True)
    test_name = serializers.CharField()
    instructions = serializers.CharField(allow_blank=True)
    matched = serializers.BooleanField()
    category = serializers.CharField(allow_blank=True)
    is_panel = serializers.BooleanField()
    component_count = serializers.IntegerField()


class LaboratoryOrderSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    created_at = serializers.DateTimeField()
    patient = serializers.IntegerField()
    patient_name = serializers.CharField()
    items = LaboratoryOrderItemSerializer(many=True)


class LaboratoryBillItemSerializer(serializers.Serializer):
    test = serializers.IntegerField()
    test_name = serializers.CharField()
    instructions = serializers.CharField(allow_blank=True, required=False)
    cost = serializers.DecimalField(max_digits=10, decimal_places=2)


class LaboratoryResultItemSerializer(serializers.Serializer):
    test = serializers.IntegerField()
    result = serializers.CharField(allow_blank=True, max_length=255)


class LaboratoryResultUpdateSerializer(serializers.Serializer):
    items = LaboratoryResultItemSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('Add at least one result row.')
        return value


class LaboratoryBillCreateSerializer(serializers.Serializer):
    customer_type = serializers.ChoiceField(choices=(('internal', 'Internal'), ('external', 'External')))
    patient = serializers.IntegerField(required=False)
    lab_order_document = serializers.IntegerField(required=False)
    customer_name = serializers.CharField(max_length=180, allow_blank=True, required=False)
    items = LaboratoryBillItemSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('Add at least one lab test.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs['customer_type'] == 'internal':
            if not attrs.get('patient'):
                raise serializers.ValidationError({'patient': 'Select an internal patient.'})
        elif not attrs.get('customer_name', '').strip():
            raise serializers.ValidationError({'customer_name': 'Type the external customer name.'})
        return attrs


class LaboratoryBillSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.__str__', read_only=True)
    payload = serializers.SerializerMethodField()
    payment_status = serializers.CharField(source='payment.status', read_only=True)
    payment_id = serializers.IntegerField(source='payment.id', read_only=True, allow_null=True)
    customer_type = serializers.SerializerMethodField()
    customer_type_label = serializers.SerializerMethodField()
    lab_order_document_id = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    has_results = serializers.SerializerMethodField()

    class Meta:
        model = ClinicalDocument
        fields = (
            'id',
            'patient',
            'patient_name',
            'title',
            'payload',
            'total_amount',
            'created_at',
            'payment_id',
            'payment_status',
            'customer_type',
            'customer_type_label',
            'lab_order_document_id',
            'item_count',
            'has_results',
        )
        read_only_fields = fields

    def get_customer_type(self, obj):
        payload = enrich_lab_bill_payload(obj.payload)
        return payload.get('customer_type', 'external')

    def get_customer_type_label(self, obj):
        return 'Internal' if self.get_customer_type(obj) == 'internal' else 'External'

    def get_payload(self, obj):
        return enrich_lab_bill_payload(obj.payload)

    def get_lab_order_document_id(self, obj):
        payload = enrich_lab_bill_payload(obj.payload)
        value = payload.get('lab_order_document')
        return value if isinstance(value, int) else None

    def get_item_count(self, obj):
        payload = enrich_lab_bill_payload(obj.payload)
        items = payload.get('ordered_items')
        return len(items) if isinstance(items, list) else 0

    def get_has_results(self, obj):
        payload = enrich_lab_bill_payload(obj.payload)
        items = payload.get('result_items')
        if not isinstance(items, list):
            return False
        return any(str(item.get('result', '')).strip() for item in items if isinstance(item, dict))


class LaboratoryDashboardSerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=(('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly'), ('annual', 'Annual')))
    period_label = serializers.CharField()
    pending_lab_orders = serializers.IntegerField()
    bills_created = serializers.IntegerField()
    internal_patients = serializers.IntegerField()
    internal_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    external_patients = serializers.IntegerField()
    external_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    full_paid = serializers.IntegerField()
    full_paid_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    discounted = serializers.IntegerField()
    discounted_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    free = serializers.IntegerField()
    free_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    pending_reception_payments = serializers.IntegerField()
    pending_reception_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    approved_reception_payments = serializers.IntegerField()
    approved_reception_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    monthly_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    patient_trend = serializers.ListField(child=serializers.DictField())
    recent_bills_count = serializers.IntegerField()
    recent_bills = LaboratoryBillSerializer(many=True)


def latest_lab_order_for_patient(patient_id: int):
    return (
        ClinicalDocument.objects.filter(
            patient_id=patient_id,
            document_type=ClinicalDocument.DocumentType.LAB_ORDER,
        )
        .select_related('patient')
        .order_by('-created_at')
        .first()
    )


def serialize_lab_order_items(order: ClinicalDocument):
    payload = order.payload if isinstance(order.payload, dict) else {}
    items = payload.get('items')
    rows = []
    for item in items if isinstance(items, list) else []:
        test_id = item.get('test') if isinstance(item.get('test'), int) else None
        test_name = str(item.get('test_name') or item.get('test') or '').strip()
        test = resolve_lab_test_reference(test_id, test_name)
        rows.append(
            {
                'test': test.id if test is not None else test_id,
                'test_name': lab_test_label(test, fallback=test_name) if test is not None else test_name,
                'instructions': str(item.get('instructions', '')),
                'matched': test is not None and test.is_active,
                'category': test.category if test is not None else '',
                'is_panel': bool(test.is_panel) if test is not None else False,
                'component_count': test.components.filter(is_active=True).count() if test is not None and test.is_panel else 1,
            }
        )
    return rows
