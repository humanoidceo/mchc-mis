from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import MchcTokenObtainPairView, UserViewSet, me, permission_catalog

router = DefaultRouter()
router.register('users', UserViewSet, basename='users')

urlpatterns = [
    path('login/', MchcTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('me/', me, name='me'),
    path('permissions/', permission_catalog, name='permission_catalog'),
    path('', include(router.urls)),
]
