from django.contrib import messages
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404, redirect, render

from .decorators import pharmacist_required
from .forms import MedicineForm, PharmacySettingForm
from .models import Medicine, PharmacySetting, Sale, SaleItem, sync_medicine_profit_percentages


def get_pharmacy_setting(user):
    setting, _ = PharmacySetting.objects.get_or_create(pharmacist=user)
    return setting


@pharmacist_required
def dashboard(request):
    medicines_count = Medicine.objects.filter(pharmacist=request.user).count()
    low_stock = Medicine.objects.filter(pharmacist=request.user, quantity__lte=10).count()
    sales_count = Sale.objects.filter(pharmacist=request.user).count()

    return render(
        request,
        "pharmacy/dashboard.html",
        {
            "medicines_count": medicines_count,
            "low_stock": low_stock,
            "sales_count": sales_count,
        },
    )


@pharmacist_required
def pharmacy_settings(request):
    setting = get_pharmacy_setting(request.user)

    if request.method == "POST":
        form = PharmacySettingForm(request.POST, instance=setting)
        if form.is_valid():
            form.save()
            sync_medicine_profit_percentages(request.user)
            messages.success(request, "Pharmacy settings updated successfully.")
            return redirect("pharmacy:settings")
    else:
        form = PharmacySettingForm(instance=setting)

    return render(request, "pharmacy/settings.html", {"form": form})


@pharmacist_required
def medicine_list(request):
    medicines = Medicine.objects.filter(pharmacist=request.user)
    query = request.GET.get("q", "").strip()

    if query:
        medicines = medicines.filter(
            Q(name__icontains=query) | Q(generic_name__icontains=query)
        )

    return render(
        request,
        "pharmacy/medicine_list.html",
        {"medicines": medicines, "query": query},
    )


@pharmacist_required
def medicine_create(request):
    setting = get_pharmacy_setting(request.user)

    if request.method == "POST":
        form = MedicineForm(request.POST)
        if form.is_valid():
            medicine = form.save(commit=False)
            medicine.pharmacist = request.user
            medicine.save()
            messages.success(request, "Medicine added to stock successfully.")
            return redirect("pharmacy:medicine_list")
    else:
        form = MedicineForm(
            initial={"profit_percentage": setting.default_profit_percentage}
        )

    return render(
        request,
        "pharmacy/medicine_form.html",
        {"form": form, "title": "Add Medicine"},
    )


@pharmacist_required
def medicine_update(request, pk):
    medicine = get_object_or_404(Medicine, pk=pk, pharmacist=request.user)

    if request.method == "POST":
        form = MedicineForm(request.POST, instance=medicine)
        if form.is_valid():
            form.save()
            messages.success(request, "Medicine updated successfully.")
            return redirect("pharmacy:medicine_list")
    else:
        form = MedicineForm(instance=medicine)

    return render(
        request,
        "pharmacy/medicine_form.html",
        {"form": form, "title": "Edit Medicine"},
    )


@pharmacist_required
def sale_create(request):
    medicines = Medicine.objects.filter(
        pharmacist=request.user,
        quantity__gt=0,
    ).order_by("name")

    if request.method == "POST":
        customer_name = request.POST.get("customer_name", "").strip()
        medicine_ids = request.POST.getlist("medicine_id")
        quantities = request.POST.getlist("quantity")

        cleaned_items = []
        errors = []

        for med_id, qty in zip(medicine_ids, quantities):
            if not med_id:
                continue

            try:
                qty = int(qty)
            except (TypeError, ValueError):
                qty = 0

            if qty <= 0:
                continue

            try:
                medicine = Medicine.objects.get(pk=med_id, pharmacist=request.user)
            except Medicine.DoesNotExist:
                errors.append("Invalid medicine selected.")
                continue

            if qty > medicine.quantity:
                errors.append(
                    f"{medicine.name}: only {medicine.quantity} available in stock."
                )
                continue

            cleaned_items.append((medicine, qty))

        if not cleaned_items:
            errors.append("Please select at least one medicine with quantity.")

        if errors:
            for error in errors:
                messages.error(request, error)
            return render(
                request,
                "pharmacy/sale_create.html",
                {"medicines": medicines},
            )

        with transaction.atomic():
            sale = Sale.objects.create(
                pharmacist=request.user,
                customer_name=customer_name,
            )

            for medicine, qty in cleaned_items:
                SaleItem.objects.create(
                    sale=sale,
                    medicine=medicine,
                    medicine_name=medicine.name,
                    generic_name=medicine.generic_name,
                    quantity=qty,
                    unit_price=medicine.sell_price,
                )
                medicine.quantity -= qty
                medicine.save()

        messages.success(request, "Bill created successfully.")
        return redirect("pharmacy:bill_print", pk=sale.pk)

    return render(request, "pharmacy/sale_create.html", {"medicines": medicines})


@pharmacist_required
def bill_print(request, pk):
    sale = get_object_or_404(
        Sale.objects.prefetch_related("items"),
        pk=pk,
        pharmacist=request.user,
    )
    setting = get_pharmacy_setting(request.user)

    return render(
        request,
        "pharmacy/bill_print.html",
        {"sale": sale, "setting": setting},
    )


@pharmacist_required
def sale_list(request):
    sales = Sale.objects.filter(pharmacist=request.user).prefetch_related("items")
    return render(request, "pharmacy/sale_list.html", {"sales": sales})
