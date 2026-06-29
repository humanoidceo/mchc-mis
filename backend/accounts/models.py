from django.conf import settings
from django.db import models

from .permissions import ROLE_CHOICES, Role, default_permissions_for_role


class StaffProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='staff_profile')
    role = models.CharField(max_length=32, choices=ROLE_CHOICES)
    phone = models.CharField(max_length=32, blank=True)
    allowed_permissions = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('user__first_name', 'user__last_name', 'user__username')

    def __str__(self) -> str:
        return f'{self.user.get_full_name() or self.user.username} ({self.role})'

    def save(self, *args, **kwargs):
        if self.role == Role.SUPER_ADMIN:
            self.user.is_staff = True
            self.user.is_superuser = True
            self.user.save(update_fields=['is_staff', 'is_superuser'])
        if not self.allowed_permissions:
            self.allowed_permissions = default_permissions_for_role(self.role)
        super().save(*args, **kwargs)
