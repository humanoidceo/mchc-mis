from rest_framework import serializers

from .models import ClinicalDocument, Medicine, MedicineStockMovement, Patient, Payment


class PatientSerializer(serializers.ModelSerializer):
    registered_by_name = serializers.CharField(source='registered_by.get_full_name', read_only=True)

    class Meta:
        model = Patient
        fields = '__all__'
        read_only_fields = ('registered_by', 'created_at', 'updated_at')


class PaymentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.__str__', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)

    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ('created_by', 'approved_by', 'approved_at', 'created_at', 'updated_at')


class ClinicalDocumentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.__str__', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    document_type_label = serializers.CharField(source='get_document_type_display', read_only=True)

    class Meta:
        model = ClinicalDocument
        fields = '__all__'
        read_only_fields = ('created_by', 'created_at', 'updated_at')


class MedicineSerializer(serializers.ModelSerializer):
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Medicine
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_is_low_stock(self, obj) -> bool:
        return obj.current_stock <= obj.low_stock_threshold


class MedicineStockMovementSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(source='medicine.name', read_only=True)

    class Meta:
        model = MedicineStockMovement
        fields = '__all__'
        read_only_fields = ('created_by', 'created_at', 'updated_at')
