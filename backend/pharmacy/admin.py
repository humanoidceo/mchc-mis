from django.contrib import admin

from .models import Medicine, PharmacySetting, Sale, SaleItem


@admin.register(PharmacySetting)
class PharmacySettingAdmin(admin.ModelAdmin):
    list_display = (
        "pharmacy_name",
        "pharmacist",
        "default_profit_percentage",
        "phone",
    )
    search_fields = ("pharmacy_name", "pharmacist__username")


@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "generic_name",
        "dosage_form",
        "strength",
        "pharmacist",
        "quantity",
        "buy_price",
        "profit_percentage",
        "sell_price",
    )
    list_filter = ("pharmacist",)
    search_fields = ("name", "generic_name", "dosage_form", "strength", "pharmacist__username")
    readonly_fields = ("sell_price",)


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0
    readonly_fields = (
        "medicine",
        "medicine_name",
        "generic_name",
        "quantity",
        "unit_price",
    )


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = (
        "bill_no",
        "pharmacist",
        "customer_name",
        "created_at",
        "total_amount",
    )
    list_filter = ("pharmacist", "created_at")
    search_fields = ("bill_no", "customer_name", "pharmacist__username")
    inlines = [SaleItemInline]
