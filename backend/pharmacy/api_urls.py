from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .api_views import (
    PharmacyDashboardViewSet,
    PharmacyMedicineViewSet,
    PharmacyPatientViewSet,
    PharmacySaleViewSet,
    PharmacySettingViewSet,
)

router = DefaultRouter()
router.register("dashboard", PharmacyDashboardViewSet, basename="pharmacy-dashboard")
router.register("medicines", PharmacyMedicineViewSet, basename="pharmacy-medicines")
router.register("patients", PharmacyPatientViewSet, basename="pharmacy-patients")
router.register("sales", PharmacySaleViewSet, basename="pharmacy-sales")

urlpatterns = [
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
