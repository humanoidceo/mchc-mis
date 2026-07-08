from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EmployeeViewSet, MchcTokenObtainPairView, MchcTokenRefreshView, UserViewSet, account_settings, logout, me, permission_catalog, username_availability

router = DefaultRouter()
router.register('users', UserViewSet, basename='users')
router.register('employees', EmployeeViewSet, basename='employees')

urlpatterns = [
    path('login/', MchcTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('refresh/', MchcTokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', logout, name='logout'),
    path('me/', me, name='me'),
    path('account/', account_settings, name='account_settings'),
    path('account/username-availability/', username_availability, name='username_availability'),
    path('permissions/', permission_catalog, name='permission_catalog'),
    path('', include(router.urls)),
]
