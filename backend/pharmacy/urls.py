from django.urls import path

from . import views

app_name = "pharmacy"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("settings/", views.pharmacy_settings, name="settings"),

    path("medicines/", views.medicine_list, name="medicine_list"),
    path("medicines/add/", views.medicine_create, name="medicine_create"),
    path("medicines/<int:pk>/edit/", views.medicine_update, name="medicine_update"),

    path("sales/", views.sale_list, name="sale_list"),
    path("sales/new/", views.sale_create, name="sale_create"),
    path("sales/<int:pk>/bill/", views.bill_print, name="bill_print"),
]
