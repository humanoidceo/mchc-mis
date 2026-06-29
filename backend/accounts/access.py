from rest_framework.permissions import BasePermission

from .permissions import ALL_PERMISSION_CODES, Role


def get_user_permissions(user) -> set[str]:
    if not user or not user.is_authenticated:
        return set()
    if user.is_superuser:
        return set(ALL_PERMISSION_CODES)
    profile = getattr(user, 'staff_profile', None)
    if not profile:
        return set()
    if profile.role == Role.SUPER_ADMIN:
        return set(ALL_PERMISSION_CODES)
    return set(profile.allowed_permissions or [])


def user_has_permission(user, code: str) -> bool:
    return code in get_user_permissions(user)


class HasMchcPermission(BasePermission):
    permission_code: str | None = None

    def has_permission(self, request, view) -> bool:
        code = getattr(view, 'permission_code', self.permission_code)
        return bool(code and user_has_permission(request.user, code))
