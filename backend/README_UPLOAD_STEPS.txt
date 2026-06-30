MCHC-MIS Pharmacy Module - Ready for Upload

Upload/copy the folder named "pharmacy" into your Django project root:

    /var/www/mchc-mis/pharmacy/

Then edit your main Django settings.py and add:

    INSTALLED_APPS = [
        ...
        "pharmacy",
    ]

Then edit your main project urls.py and add include if it is not already imported:

    from django.urls import path, include

Add this route inside urlpatterns:

    path("pharmacy/", include("pharmacy.urls")),

Then run these commands on your Ubuntu server:

    cd /var/www/mchc-mis
    source venv/bin/activate
    python manage.py migrate
    python manage.py setup_pharmacy

After that:
1. Login to Django admin.
2. Open Users.
3. Edit the pharmacist user.
4. Add that user to the "Pharmacist" group.
5. Save.

Open the pharmacy module:

    https://your-domain.com/pharmacy/

Or using your server IP:

    http://195.35.20.176/pharmacy/

Feature list:
- Pharmacist-only access.
- Add/edit medicines.
- Medicine fields:
    name
    generic name
    quantity
    buy price
    profit percentage
    sell price
- Sell price is automatically calculated:
    sell price = buy price + profit percentage
- Default profit percentage is 20%.
- Pharmacist can change the default percentage in Pharmacy Settings.
- Create pharmacy bills.
- Bill decreases medicine stock quantity.
- Print bill in portrait A4, using about half A4 page height.
- Bill includes medicine price, quantity, item total, and grand total.

Important:
This module uses your existing Django user system. It controls pharmacist access through
the Django group named "Pharmacist".
