from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .api_views import (
    PharmacyDashboardViewSet,
    PharmacyFamilyPlanningOrderViewSet,
    PharmacyMedicineViewSet,
    PharmacyPatientViewSet,
    PharmacyRutfOrderViewSet,
    PharmacySaleViewSet,
    PharmacySettingViewSet,
)

router = DefaultRouter()
router.register("dashboard", PharmacyDashboardViewSet, basename="pharmacy-dashboard")
router.register("medicines", PharmacyMedicineViewSet, basename="pharmacy-medicines")
router.register("patients", PharmacyPatientViewSet, basename="pharmacy-patients")
router.register("family-planning-orders", PharmacyFamilyPlanningOrderViewSet, basename="pharmacy-family-planning-orders")
router.register("rutf-orders", PharmacyRutfOrderViewSet, basename="pharmacy-rutf-orders")
router.register("sales", PharmacySaleViewSet, basename="pharmacy-sales")

urlpatterns = [
    path(
        "medicines/export-xlsx/",
        PharmacyMedicineViewSet.as_view({"get": "export_xlsx"}),
        name="pharmacy-medicine-export-xlsx",
    ),
    path(
        "settings/",
        PharmacySettingViewSet.as_view(
            {
                "get": "list",
                "put": "update",
                "patch": "partial_update",
            }
        ),
        name="pharmacy-settings",
    ),
    path("", include(router.urls)),
]
