import json
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP

from rest_framework import serializers

from .models import ClinicalDocument, LabTest, Medicine, MedicineStockMovement, Patient, Payment, WebsitePageContent, WebsiteSettings


MONEY_QUANT = Decimal('0.01')
MAX_WEBSITE_IMAGE_SIZE = 8 * 1024 * 1024
ALLOWED_WEBSITE_IMAGE_EXTENSIONS = {'.avif', '.gif', '.heic', '.jpeg', '.jpg', '.png', '.webp'}


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def validate_website_image_file(file):
    content_type = getattr(file, 'content_type', '')
    extension = Path(file.name).suffix.lower()
    if content_type and not content_type.startswith('image/'):
        raise serializers.ValidationError('Upload an image file.')
    if extension not in ALLOWED_WEBSITE_IMAGE_EXTENSIONS:
        raise serializers.ValidationError('Supported image types: AVIF, GIF, HEIC, JPG, PNG, and WEBP.')
    if file.size > MAX_WEBSITE_IMAGE_SIZE:
        raise serializers.ValidationError('Image files must be 8 MB or smaller.')
    return file


def media_or_fallback_url(request, file, fallback: str) -> str:
    if file:
        url = file.url
        return request.build_absolute_uri(url) if request else url
    return fallback


class PatientSerializer(serializers.ModelSerializer):
    registered_by_name = serializers.CharField(source='registered_by.get_full_name', read_only=True)

    class Meta:
        model = Patient
        fields = '__all__'
        read_only_fields = ('registration_number', 'registered_by', 'created_at', 'updated_at')


class PaymentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.__str__', read_only=True)
    patient_full_name = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)

    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ('created_by', 'approved_by', 'approved_at', 'created_at', 'updated_at')
        extra_kwargs = {
            'amount': {'required': False},
            'service': {'required': False, 'allow_blank': True},
        }

    def get_patient_full_name(self, obj) -> str:
        return f'{obj.patient.first_name} {obj.patient.last_name}'.strip()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        doctor_fee = attrs.get('doctor_fee', getattr(self.instance, 'doctor_fee', Decimal('0'))) or Decimal('0')
        payment_type = attrs.get('payment_type', getattr(self.instance, 'payment_type', Payment.PaymentType.FULL))
        discount_percentage = attrs.get('discount_percentage', getattr(self.instance, 'discount_percentage', Decimal('0'))) or Decimal('0')

        if doctor_fee < 0:
            raise serializers.ValidationError({'doctor_fee': 'Doctor fee cannot be negative.'})
        if discount_percentage < 0 or discount_percentage > 100:
            raise serializers.ValidationError({'discount_percentage': 'Discount must be between 0 and 100.'})

        doctor_fee = money(doctor_fee)
        if payment_type == Payment.PaymentType.FREE:
            discount_percentage = Decimal('100')
            discount_amount = doctor_fee
            amount = Decimal('0')
        elif payment_type == Payment.PaymentType.DISCOUNT:
            discount_amount = money(doctor_fee * discount_percentage / Decimal('100'))
            amount = money(doctor_fee - discount_amount)
        else:
            discount_percentage = Decimal('0')
            discount_amount = Decimal('0')
            amount = doctor_fee

        attrs['doctor_fee'] = doctor_fee
        attrs['discount_percentage'] = money(discount_percentage)
        attrs['discount_amount'] = money(discount_amount)
        attrs['amount'] = money(amount)
        if not attrs.get('service') and attrs.get('department'):
            attrs['service'] = f"{attrs['department']} consultation"
        return attrs


class ClinicalDocumentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.__str__', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    document_type_label = serializers.CharField(source='get_document_type_display', read_only=True)

    class Meta:
        model = ClinicalDocument
        fields = '__all__'
        read_only_fields = ('created_by', 'payment', 'created_at', 'updated_at')


class MedicineSerializer(serializers.ModelSerializer):
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Medicine
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_is_low_stock(self, obj) -> bool:
        return obj.current_stock <= obj.low_stock_threshold


class LabTestSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabTest
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')


class MedicineStockMovementSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(source='medicine.name', read_only=True)

    class Meta:
        model = MedicineStockMovement
        fields = '__all__'
        read_only_fields = ('created_by', 'created_at', 'updated_at')


class WebsitePageContentSerializer(serializers.ModelSerializer):
    page_label = serializers.CharField(source='get_page_display', read_only=True)
    language_label = serializers.CharField(source='get_language_display', read_only=True)
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WebsitePageContent
        fields = (
            'id',
            'page_label',
            'language_label',
            'updated_by_name',
            'created_at',
            'updated_at',
            'page',
            'language',
            'content',
            'image_url',
            'image_file',
            'updated_by',
        )
        read_only_fields = ('updated_by', 'created_at', 'updated_at')

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['image_url'] = media_or_fallback_url(self.context.get('request'), instance.image_file, instance.image_url)
        return data

    def validate_content(self, value):
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError as exc:
                raise serializers.ValidationError('Content must be valid JSON.') from exc
        return value

    def validate_image_file(self, value):
        return validate_website_image_file(value)

    def get_updated_by_name(self, obj) -> str:
        return obj.updated_by.get_full_name() if obj.updated_by else ''


class WebsiteSettingsSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WebsiteSettings
        fields = (
            'id',
            'updated_by_name',
            'created_at',
            'updated_at',
            'logo_url',
            'logo_file',
            'updated_by',
        )
        read_only_fields = ('updated_by', 'created_at', 'updated_at')

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['logo_url'] = media_or_fallback_url(self.context.get('request'), instance.logo_file, instance.logo_url)
        return data

    def validate_logo_file(self, value):
        return validate_website_image_file(value)

    def get_updated_by_name(self, obj) -> str:
        return obj.updated_by.get_full_name() if obj.updated_by else ''
