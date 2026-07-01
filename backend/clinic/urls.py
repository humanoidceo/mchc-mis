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
from .laboratory_views import (
    LaboratoryBillViewSet,
    LaboratoryDashboardViewSet,
    LaboratoryPatientViewSet,
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
    path(
        'laboratory/dashboard/',
        LaboratoryDashboardViewSet.as_view({'get': 'list'}),
        name='laboratory-dashboard',
    ),
    path(
        'laboratory/patients/',
        LaboratoryPatientViewSet.as_view({'get': 'list'}),
        name='laboratory-patients',
    ),
    path(
        'laboratory/patients/<int:pk>/latest-order/',
        LaboratoryPatientViewSet.as_view({'get': 'latest_order'}),
        name='laboratory-patient-latest-order',
    ),
    path(
        'laboratory/bills/',
        LaboratoryBillViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='laboratory-bills',
    ),
    path(
        'laboratory/bills/<int:pk>/',
        LaboratoryBillViewSet.as_view({'get': 'retrieve', 'delete': 'destroy'}),
        name='laboratory-bill-detail',
    ),
    path(
        'laboratory/bills/<int:pk>/results/',
        LaboratoryBillViewSet.as_view({'post': 'results'}),
        name='laboratory-bill-results',
    ),
    path('', include(router.urls)),
]
