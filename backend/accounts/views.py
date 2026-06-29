from django.contrib.auth import get_user_model
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from .access import HasMchcPermission
from .access import user_has_permission
from .permissions import PERMISSION_DEFINITIONS, ROLE_CHOICES
from .serializers import (
    CurrentUserSerializer,
    MchcTokenObtainPairSerializer,
    PermissionDefinitionSerializer,
    UserWriteSerializer,
)

User = get_user_model()


class MchcTokenObtainPairView(TokenObtainPairView):
    serializer_class = MchcTokenObtainPairSerializer
    permission_classes = ()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(CurrentUserSerializer(request.user).data)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related('staff_profile').order_by('username')
    serializer_class = UserWriteSerializer
    permission_classes = (HasMchcPermission,)
    permission_code = 'users.manage'


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def permission_catalog(request):
    if not user_has_permission(request.user, 'users.manage'):
        return Response({'detail': 'Missing permission: users.manage'}, status=status.HTTP_403_FORBIDDEN)
    serializer = PermissionDefinitionSerializer(PERMISSION_DEFINITIONS, many=True)
    return Response({'permissions': serializer.data, 'roles': [{'code': code, 'label': label} for code, label in ROLE_CHOICES]})
