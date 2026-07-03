from django.contrib.auth import get_user_model
from django.db import models
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from .access import HasMchcPermission
from .access import user_has_permission
from .permissions import PERMISSION_DEFINITIONS, ROLE_CHOICES
from .serializers import (
    AccountSettingsSerializer,
    CurrentUserSerializer,
    EmployeeSerializer,
    MchcTokenObtainPairSerializer,
    PermissionDefinitionSerializer,
    UserWriteSerializer,
)
from .models import Employee

User = get_user_model()


class MchcTokenObtainPairView(TokenObtainPairView):
    serializer_class = MchcTokenObtainPairSerializer
    permission_classes = ()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(CurrentUserSerializer(request.user).data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def account_settings(request):
    serializer = AccountSettingsSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return Response(CurrentUserSerializer(user).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def username_availability(request):
    username = (request.query_params.get('username') or '').strip()
    if not username:
        return Response({'available': False, 'message': 'Username is required.'}, status=status.HTTP_400_BAD_REQUEST)

    exists = User.objects.exclude(pk=request.user.pk).filter(username__iexact=username).exists()
    if exists:
        return Response({'available': False, 'message': 'Username is already taken. Use another one.'})
    return Response({'available': True, 'message': 'Username is available.'})


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related('staff_profile').order_by('username')
    serializer_class = UserWriteSerializer
    permission_classes = (HasMchcPermission,)
    permission_code = 'users.manage'


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.select_related('created_by').order_by('-created_at', 'last_name', 'first_name')
    serializer_class = EmployeeSerializer
    permission_classes = (HasMchcPermission,)
    permission_code = 'employees.manage'
    parser_classes = (JSONParser, FormParser, MultiPartParser)

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('q', '').strip()
        if search:
            queryset = queryset.filter(
                models.Q(first_name__icontains=search)
                | models.Q(last_name__icontains=search)
                | models.Q(position__icontains=search)
                | models.Q(national_id_card_number__icontains=search)
                | models.Q(email__icontains=search)
                | models.Q(mobile_number__icontains=search)
            )
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def search(self, request):
        queryset = self.get_queryset()
        search = request.query_params.get('q', '').strip()
        try:
            offset = max(0, int(request.query_params.get('offset', '0')))
        except ValueError:
            offset = 0

        if search:
            queryset = queryset.filter(
                models.Q(first_name__icontains=search)
                | models.Q(last_name__icontains=search)
                | models.Q(position__icontains=search)
                | models.Q(national_id_card_number__icontains=search)
            )

        total = queryset.count()
        results = queryset[offset:offset + 5]
        next_offset = offset + 5 if offset + 5 < total else None
        return Response(
            {
                'results': [
                    {
                        'id': employee.id,
                        'first_name': employee.first_name,
                        'last_name': employee.last_name,
                        'position': employee.position,
                        'salary': str(employee.salary),
                    }
                    for employee in results
                ],
                'next_offset': next_offset,
            }
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def permission_catalog(request):
    if not user_has_permission(request.user, 'users.manage'):
        return Response({'detail': 'Missing permission: users.manage'}, status=status.HTTP_403_FORBIDDEN)
    serializer = PermissionDefinitionSerializer(PERMISSION_DEFINITIONS, many=True)
    return Response({'permissions': serializer.data, 'roles': [{'code': code, 'label': label} for code, label in ROLE_CHOICES]})
