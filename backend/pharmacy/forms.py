from django import forms

from .models import Medicine, PharmacySetting


class PharmacySettingForm(forms.ModelForm):
    class Meta:
        model = PharmacySetting
        fields = ["pharmacy_name", "phone", "address", "default_profit_percentage"]
        widgets = {
            "pharmacy_name": forms.TextInput(attrs={"class": "form-control"}),
            "phone": forms.TextInput(attrs={"class": "form-control"}),
            "address": forms.TextInput(attrs={"class": "form-control"}),
            "default_profit_percentage": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.01", "min": "0"}
            ),
        }


class MedicineForm(forms.ModelForm):
    class Meta:
        model = Medicine
        fields = ["name", "generic_name", "quantity", "buy_price", "profit_percentage"]
        widgets = {
            "name": forms.TextInput(attrs={"class": "form-control", "placeholder": "Medicine name"}),
            "generic_name": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "Generic name"}
            ),
            "quantity": forms.NumberInput(attrs={"class": "form-control", "min": "0"}),
            "buy_price": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.01", "min": "0"}
            ),
            "profit_percentage": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.01", "min": "0"}
            ),
        }
