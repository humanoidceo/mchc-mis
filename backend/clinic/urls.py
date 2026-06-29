from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ClinicalDocumentViewSet, DashboardViewSet, MedicineStockMovementViewSet, MedicineViewSet, PatientViewSet, PaymentViewSet

router = DefaultRouter()
router.register('dashboard', DashboardViewSet, basename='dashboard')
router.register('patients', PatientViewSet, basename='patients')
router.register('payments', PaymentViewSet, basename='payments')
router.register('documents', ClinicalDocumentViewSet, basename='documents')
router.register('medicines', MedicineViewSet, basename='medicines')
router.register('stock-movements', MedicineStockMovementViewSet, basename='stock-movements')

urlpatterns = [
    path('', include(router.urls)),
]
