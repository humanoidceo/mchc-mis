from pathlib import Path

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .access import get_user_permissions
from .models import Employee, StaffProfile
from .permissions import PERMISSION_DEFINITIONS, ROLE_CHOICES, Role, default_permissions_for_role

User = get_user_model()
MAX_EMPLOYEE_IMAGE_SIZE = 8 * 1024 * 1024
ALLOWED_EMPLOYEE_IMAGE_EXTENSIONS = {'.avif', '.gif', '.heic', '.jpeg', '.jpg', '.png', '.webp'}


def employee_image_url(request, file) -> str:
    if not file:
        return ''
    url = file.url
    return request.build_absolute_uri(url) if request else url


def validate_employee_image_file(file):
    content_type = getattr(file, 'content_type', '')
    extension = Path(file.name).suffix.lower()
    if content_type and not content_type.startswith('image/'):
        raise serializers.ValidationError('Upload an image file.')
    if extension not in ALLOWED_EMPLOYEE_IMAGE_EXTENSIONS:
        raise serializers.ValidationError('Supported image types: AVIF, GIF, HEIC, JPG, PNG, and WEBP.')
    if file.size > MAX_EMPLOYEE_IMAGE_SIZE:
        raise serializers.ValidationError('Image files must be 8 MB or smaller.')
    return file


class StaffProfileSerializer(serializers.ModelSerializer):
    role_label = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = StaffProfile
        fields = ('role', 'role_label', 'phone', 'allowed_permissions')


class CurrentUserSerializer(serializers.ModelSerializer):
    profile = StaffProfileSerializer(source='staff_profile', read_only=True)
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'is_active', 'is_superuser', 'profile', 'permissions')

    def get_permissions(self, obj) -> list[str]:
        return sorted(get_user_permissions(obj))


class MchcTokenObtainPairSerializer(TokenObtainPairSerializer):
    email = serializers.EmailField(write_only=True)
    username = serializers.CharField(required=False, write_only=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields[self.username_field].required = False

    def validate(self, attrs):
        email = attrs.pop('email', '').strip()
        if email:
            try:
                user = User.objects.get(email__iexact=email, is_active=True)
            except User.DoesNotExist as exc:
                raise serializers.ValidationError({'email': 'No active user found with this email address.'}) from exc
            except User.MultipleObjectsReturned as exc:
                raise serializers.ValidationError({'email': 'Multiple users use this email address. Contact an administrator.'}) from exc
            attrs[self.username_field] = user.get_username()
        data = super().validate(attrs)
        data['user'] = CurrentUserSerializer(self.user).data
        return data


class UserWriteSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=ROLE_CHOICES, write_only=True)
    phone = serializers.CharField(required=False, allow_blank=True, write_only=True)
    allowed_permissions = serializers.ListField(
        child=serializers.ChoiceField(choices=[(code, code) for code in [p.code for p in PERMISSION_DEFINITIONS]]),
        required=False,
        write_only=True,
    )
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    profile = StaffProfileSerializer(source='staff_profile', read_only=True)
    permissions = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = (
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'is_active',
            'password',
            'role',
            'phone',
            'allowed_permissions',
            'profile',
            'permissions',
        )

    def get_permissions(self, obj) -> list[str]:
        return sorted(get_user_permissions(obj))

    def validate_username(self, value: str) -> str:
        username = value.strip()
        queryset = User.objects.exclude(pk=getattr(self.instance, 'pk', None)).filter(username__iexact=username)
        if queryset.exists():
            raise serializers.ValidationError('This username is already taken.')
        return username

    def create(self, validated_data):
        role = validated_data.pop('role')
        phone = validated_data.pop('phone', '')
        permissions = validated_data.pop('allowed_permissions', default_permissions_for_role(role))
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.is_staff = role == Role.SUPER_ADMIN
        user.is_superuser = role == Role.SUPER_ADMIN
        user.save()
        StaffProfile.objects.create(user=user, role=role, phone=phone, allowed_permissions=permissions)
        return user

    def update(self, instance, validated_data):
        role = validated_data.pop('role', None)
        phone = validated_data.pop('phone', None)
        permissions = validated_data.pop('allowed_permissions', None)
        password = validated_data.pop('password', None)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        if role == Role.SUPER_ADMIN:
            instance.is_staff = True
            instance.is_superuser = True
        instance.save()

        profile = getattr(instance, 'staff_profile', None)
        if profile is None and role:
            profile = StaffProfile.objects.create(user=instance, role=role)
        if profile:
            if role:
                profile.role = role
            if phone is not None:
                profile.phone = phone
            if permissions is not None:
                profile.allowed_permissions = permissions
            profile.save()
        return instance


class AccountSettingsSerializer(serializers.Serializer):
    username = serializers.CharField(required=False, min_length=1)
    email = serializers.EmailField(required=False)
    current_password = serializers.CharField(write_only=True, required=False, allow_blank=False, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, required=False, allow_blank=False, min_length=8, trim_whitespace=False)
    confirm_new_password = serializers.CharField(write_only=True, required=False, allow_blank=False, trim_whitespace=False)

    def validate_username(self, value: str) -> str:
        username = value.strip()
        user = self.context['request'].user
        if not username:
            raise serializers.ValidationError('Username is required.')
        if User.objects.exclude(pk=user.pk).filter(username__iexact=username).exists():
            raise serializers.ValidationError('This username is already taken. Use another one.')
        return username

    def validate_email(self, value: str) -> str:
        email = value.strip().lower()
        user = self.context['request'].user
        if User.objects.exclude(pk=user.pk).filter(email__iexact=email).exists():
            raise serializers.ValidationError('Another user already uses this email address.')
        return email

    def validate(self, attrs):
        user = self.context['request'].user
        new_password = attrs.get('new_password')
        confirm_new_password = attrs.get('confirm_new_password')
        current_password = attrs.get('current_password')

        if new_password or confirm_new_password or current_password:
            if not current_password:
                raise serializers.ValidationError({'current_password': 'Current password is required to set a new password.'})
            if not user.check_password(current_password):
                raise serializers.ValidationError({'current_password': 'Current password is incorrect.'})
            if not new_password:
                raise serializers.ValidationError({'new_password': 'Enter a new password.'})
            if new_password != confirm_new_password:
                raise serializers.ValidationError({'confirm_new_password': 'New password confirmation does not match.'})
            validate_password(new_password, user=user)

        if not attrs:
            raise serializers.ValidationError('Provide a new email address or a new password.')

        return attrs

    def save(self, **kwargs):
        user = self.context['request'].user
        username = self.validated_data.get('username')
        email = self.validated_data.get('email')
        new_password = self.validated_data.get('new_password')

        changed_fields: list[str] = []
        if username is not None and username != user.username:
            user.username = username
            changed_fields.append('username')
        if email is not None and email != user.email:
            user.email = email
            changed_fields.append('email')
        if new_password:
            user.set_password(new_password)
            changed_fields.append('password')

        if changed_fields:
            user.save()
        return user


class PermissionDefinitionSerializer(serializers.Serializer):
    code = serializers.CharField()
    label = serializers.CharField()
    group = serializers.CharField()
    default_roles = serializers.ListField(child=serializers.CharField())


class EmployeeSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = Employee
        fields = (
            'id',
            'first_name',
            'last_name',
            'position',
            'salary',
            'join_date',
            'national_id_card_number',
            'email',
            'contact_info',
            'mobile_number',
            'image',
            'image_url',
            'created_by_name',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('created_by_name', 'created_at', 'updated_at', 'image_url')

    def get_image_url(self, obj) -> str:
        return employee_image_url(self.context.get('request'), obj.image)

    def validate_image(self, value):
        return validate_employee_image_file(value)
