from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

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


def _cookie_max_age(setting_name: str) -> int:
    return int(settings.SIMPLE_JWT[setting_name].total_seconds())


def _should_use_secure_cookie(request) -> bool:
    if not settings.JWT_COOKIE_SECURE:
        return False
    if request.is_secure():
        return True
    forwarded_proto = request.META.get('HTTP_X_FORWARDED_PROTO', '')
    return forwarded_proto.split(',')[0].strip().lower() == 'https'


def _set_token_cookie(request, response, *, name: str, value: str, max_age: int, path: str) -> None:
    response.set_cookie(
        name,
        value,
        max_age=max_age,
        httponly=True,
        secure=_should_use_secure_cookie(request),
        samesite=settings.JWT_COOKIE_SAMESITE,
        path=path,
    )


def set_auth_cookies(request, response, *, access: str | None = None, refresh: str | None = None) -> None:
    if access:
        _set_token_cookie(
            request,
            response,
            name=settings.JWT_ACCESS_COOKIE_NAME,
            value=access,
            max_age=_cookie_max_age('ACCESS_TOKEN_LIFETIME'),
            path=settings.JWT_ACCESS_COOKIE_PATH,
        )
    if refresh:
        _set_token_cookie(
            request,
            response,
            name=settings.JWT_REFRESH_COOKIE_NAME,
            value=refresh,
            max_age=_cookie_max_age('REFRESH_TOKEN_LIFETIME'),
            path=settings.JWT_REFRESH_COOKIE_PATH,
        )


def clear_auth_cookies(response) -> None:
    response.delete_cookie(
        settings.JWT_ACCESS_COOKIE_NAME,
        path=settings.JWT_ACCESS_COOKIE_PATH,
        samesite=settings.JWT_COOKIE_SAMESITE,
    )
    response.delete_cookie(
        settings.JWT_REFRESH_COOKIE_NAME,
        path=settings.JWT_REFRESH_COOKIE_PATH,
        samesite=settings.JWT_COOKIE_SAMESITE,
    )


def _resolve_user_from_access_cookie(request):
    raw_token = request.COOKIES.get(settings.JWT_ACCESS_COOKIE_NAME)
    if not raw_token:
        return None

    authenticator = JWTAuthentication()
    validated_token = authenticator.get_validated_token(raw_token)
    return authenticator.get_user(validated_token)


def _resolve_user_from_refresh_cookie(request):
    raw_token = request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
    if not raw_token:
        return None, None

    refresh_token = RefreshToken(raw_token)
    user_id = refresh_token.get('user_id')
    if not user_id:
        raise InvalidToken('Refresh token has no user id.')

    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None:
        raise InvalidToken('User was not found or is inactive.')

    return user, str(refresh_token.access_token)


class MchcTokenObtainPairView(TokenObtainPairView):
    serializer_class = MchcTokenObtainPairSerializer
    permission_classes = ()

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        response = Response({'user': data['user']}, status=status.HTTP_200_OK)
        set_auth_cookies(request, response, access=data.get('access'), refresh=data.get('refresh'))
        return response


class MchcTokenRefreshView(TokenRefreshView):
    permission_classes = ()

    def post(self, request, *args, **kwargs):
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        refresh_token = data.get('refresh') or request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
        if refresh_token:
            data['refresh'] = refresh_token

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        response = Response({'detail': 'Access token refreshed.'}, status=status.HTTP_200_OK)
        set_auth_cookies(
            request,
            response,
            access=serializer.validated_data.get('access'),
            refresh=serializer.validated_data.get('refresh'),
        )
        return response


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def me(request):
    try:
        user = _resolve_user_from_access_cookie(request)
    except (InvalidToken, TokenError):
        user = None

    if user is not None:
        return Response(CurrentUserSerializer(user).data)

    try:
        user, access_token = _resolve_user_from_refresh_cookie(request)
    except (InvalidToken, TokenError):
        response = Response(None, status=status.HTTP_200_OK)
        clear_auth_cookies(response)
        return response

    if user is not None and access_token:
        response = Response(CurrentUserSerializer(user).data)
        set_auth_cookies(request, response, access=access_token)
        return response

    return Response(None, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([])
def logout(request):
    response = Response({'detail': 'Logged out.'}, status=status.HTTP_200_OK)
    clear_auth_cookies(response)
    return response


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
