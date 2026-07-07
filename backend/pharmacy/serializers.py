from rest_framework import serializers

from .models import Medicine, PharmacySetting, Sale, SaleItem


class PharmacySettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = PharmacySetting
        fields = (
            "id",
            "pharmacy_name",
            "phone",
            "address",
            "default_profit_percentage",
        )


class PharmacyMedicineSerializer(serializers.ModelSerializer):
    stock_status = serializers.SerializerMethodField()

    class Meta:
        model = Medicine
        fields = (
            "id",
            "name",
            "generic_name",
            "country_of_product",
            "production_date",
            "expiry_date",
            "quantity",
            "buy_price",
            "profit_percentage",
            "sell_price",
            "stock_status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("profit_percentage", "sell_price", "created_at", "updated_at", "stock_status")

    def get_stock_status(self, obj):
        if obj.quantity <= 10:
            return "low"
        if obj.quantity <= 30:
            return "medium"
        return "healthy"


class PharmacySaleItemSerializer(serializers.ModelSerializer):
    total_price = serializers.SerializerMethodField()

    class Meta:
        model = SaleItem
        fields = (
            "id",
            "medicine",
            "medicine_name",
            "generic_name",
            "quantity",
            "unit_price",
            "total_price",
        )
        read_only_fields = fields

    def get_total_price(self, obj):
        return str(obj.total_price)


class PharmacySaleSerializer(serializers.ModelSerializer):
    items = PharmacySaleItemSerializer(many=True, read_only=True)
    total_amount = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    customer_type_label = serializers.CharField(source="get_customer_type_display", read_only=True)
    patient_name = serializers.SerializerMethodField()
    payment_status = serializers.CharField(source="payment.status", read_only=True)
    payment_id = serializers.IntegerField(source="payment.id", read_only=True, allow_null=True)
    prescription_document_id = serializers.IntegerField(source="prescription_document.id", read_only=True, allow_null=True)

    class Meta:
        model = Sale
        fields = (
            "id",
            "bill_no",
            "customer_type",
            "customer_type_label",
            "patient",
            "patient_name",
            "customer_name",
            "created_at",
            "items",
            "item_count",
            "total_amount",
            "payment_id",
            "payment_status",
            "prescription_document_id",
        )
        read_only_fields = fields

    def get_total_amount(self, obj):
        return str(obj.total_amount)

    def get_item_count(self, obj):
        return sum(item.quantity for item in obj.items.all())

    def get_patient_name(self, obj):
        if not obj.patient:
            return ""
        return f"{obj.patient.first_name} {obj.patient.last_name}".strip()


class PharmacySaleCreateItemSerializer(serializers.Serializer):
    medicine = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2)


class PharmacySaleCreateSerializer(serializers.Serializer):
    customer_type = serializers.ChoiceField(choices=Sale.CustomerType.choices)
    patient = serializers.IntegerField(required=False)
    prescription_document = serializers.IntegerField(required=False)
    customer_name = serializers.CharField(max_length=180, allow_blank=True, required=False)
    items = PharmacySaleCreateItemSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one medicine is required.")

        seen_medicines = set()
        for item in value:
            medicine_id = item["medicine"]
            if medicine_id in seen_medicines:
                raise serializers.ValidationError("Each medicine can only appear once in a bill.")
            seen_medicines.add(medicine_id)
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        customer_type = attrs["customer_type"]
        if customer_type == Sale.CustomerType.INTERNAL:
            if not attrs.get("patient"):
                raise serializers.ValidationError({"patient": "Select an internal patient."})
        else:
            if not attrs.get("customer_name", "").strip():
                raise serializers.ValidationError({"customer_name": "Type the external customer name."})
        return attrs


class PharmacyDashboardSerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=(("daily", "Daily"), ("weekly", "Weekly"), ("monthly", "Monthly"), ("annual", "Annual")))
    period_label = serializers.CharField()
    medicines_count = serializers.IntegerField()
    low_stock_count = serializers.IntegerField()
    sales_count = serializers.IntegerField()
    internal_patients = serializers.IntegerField()
    internal_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    external_patients = serializers.IntegerField()
    external_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    full_paid = serializers.IntegerField()
    full_paid_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    discounted = serializers.IntegerField()
    discounted_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    free = serializers.IntegerField()
    free_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    pending_reception_payments = serializers.IntegerField()
    pending_reception_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    approved_reception_payments = serializers.IntegerField()
    approved_reception_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    stock_units = serializers.IntegerField()
    inventory_value = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_billed = serializers.DecimalField(max_digits=14, decimal_places=2)
    sold_medicines_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    sold_medicines_profit = serializers.DecimalField(max_digits=14, decimal_places=2)
    sold_medicines_price = serializers.DecimalField(max_digits=14, decimal_places=2)
    family_planning_items_dispensed = serializers.IntegerField()
    patient_trend = serializers.ListField(child=serializers.DictField())
    recent_sales_count = serializers.IntegerField()
    recent_sales = PharmacySaleSerializer(many=True)
    low_stock_items = PharmacyMedicineSerializer(many=True)


class PharmacyPatientSearchSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    registration_number = serializers.CharField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    age = serializers.IntegerField(allow_null=True)
    phone = serializers.CharField(allow_blank=True)


class PharmacyPrescriptionItemSerializer(serializers.Serializer):
    medicine = serializers.IntegerField(allow_null=True)
    medicine_name = serializers.CharField()
    quantity = serializers.CharField()
    instructions = serializers.CharField()
    pharmacy_medicine = serializers.IntegerField(allow_null=True)
    pharmacy_medicine_name = serializers.CharField(allow_blank=True)
    pharmacy_stock = serializers.IntegerField()
    pharmacy_sell_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    matched = serializers.BooleanField()


class PharmacyPrescriptionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    created_at = serializers.DateTimeField()
    patient = serializers.IntegerField()
    patient_name = serializers.CharField()
    items = PharmacyPrescriptionItemSerializer(many=True)


class PharmacyRutfOrderSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    patient = serializers.IntegerField()
    patient_name = serializers.CharField()
    created_by_name = serializers.CharField()
    title = serializers.CharField()
    created_at = serializers.DateTimeField()
    payload = serializers.DictField()
    rutf_quantity = serializers.DecimalField(max_digits=10, decimal_places=1)
    pharmacy_status = serializers.CharField()
    approved_by_name = serializers.CharField(allow_blank=True)


class PharmacyFamilyPlanningItemSerializer(serializers.Serializer):
    medicine = serializers.IntegerField()
    medicine_name = serializers.CharField()
    quantity = serializers.DecimalField(max_digits=10, decimal_places=1)


class PharmacyFamilyPlanningOrderSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    patient = serializers.IntegerField()
    patient_name = serializers.CharField()
    created_by_name = serializers.CharField()
    title = serializers.CharField()
    created_at = serializers.DateTimeField()
    payload = serializers.DictField()
    items = PharmacyFamilyPlanningItemSerializer(many=True)
    item_count = serializers.IntegerField()
    pharmacy_status = serializers.CharField()
    dispensed_by_name = serializers.CharField(allow_blank=True)
