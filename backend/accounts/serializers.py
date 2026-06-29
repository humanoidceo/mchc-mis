from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .access import get_user_permissions
from .models import StaffProfile
from .permissions import PERMISSION_DEFINITIONS, ROLE_CHOICES, Role, default_permissions_for_role

User = get_user_model()


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
    def validate(self, attrs):
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


class PermissionDefinitionSerializer(serializers.Serializer):
    code = serializers.CharField()
    label = serializers.CharField()
    group = serializers.CharField()
    default_roles = serializers.ListField(child=serializers.CharField())
