from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ClinicalDocumentViewSet,
    DashboardViewSet,
    LabTestViewSet,
    MedicineStockMovementViewSet,
    MedicineViewSet,
    PatientViewSet,
    PaymentViewSet,
    WebsitePageContentViewSet,
    WebsiteSettingsViewSet,
)

router = DefaultRouter()
router.register('dashboard', DashboardViewSet, basename='dashboard')
router.register('patients', PatientViewSet, basename='patients')
router.register('payments', PaymentViewSet, basename='payments')
router.register('documents', ClinicalDocumentViewSet, basename='documents')
router.register('lab-tests', LabTestViewSet, basename='lab-tests')
router.register('medicines', MedicineViewSet, basename='medicines')
router.register('stock-movements', MedicineStockMovementViewSet, basename='stock-movements')
router.register('website-content', WebsitePageContentViewSet, basename='website-content')
router.register('website-settings', WebsiteSettingsViewSet, basename='website-settings')

urlpatterns = [
    path('', include(router.urls)),
]
