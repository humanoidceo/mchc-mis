from django.contrib import admin

from .models import ClinicalDocument, Medicine, MedicineStockMovement, Patient, Payment, WebsitePageContent, WebsiteSettings


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('registration_number', 'first_name', 'last_name', 'gender', 'phone', 'created_at')
    search_fields = ('registration_number', 'first_name', 'last_name', 'phone')


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('patient', 'service', 'amount', 'status', 'created_at')
    list_filter = ('status',)


@admin.register(ClinicalDocument)
class ClinicalDocumentAdmin(admin.ModelAdmin):
    list_display = ('patient', 'document_type', 'title', 'total_amount', 'created_at')
    list_filter = ('document_type',)


@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    list_display = ('name', 'unit', 'sale_price', 'current_stock', 'low_stock_threshold', 'is_active')
    search_fields = ('name',)


@admin.register(MedicineStockMovement)
class MedicineStockMovementAdmin(admin.ModelAdmin):
    list_display = ('medicine', 'movement_type', 'quantity', 'created_at')
    list_filter = ('movement_type',)


@admin.register(WebsitePageContent)
class WebsitePageContentAdmin(admin.ModelAdmin):
    list_display = ('page', 'language', 'updated_by', 'updated_at')
    list_filter = ('page', 'language')
    search_fields = ('page', 'language')


@admin.register(WebsiteSettings)
class WebsiteSettingsAdmin(admin.ModelAdmin):
    list_display = ('id', 'updated_by', 'updated_at')
