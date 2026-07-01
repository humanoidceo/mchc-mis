from django.conf import settings
from django.db import models

from .permissions import ROLE_CHOICES, Role, default_permissions_for_role


def employee_image_upload_path(instance, filename: str) -> str:
    return f'employees/{instance.national_id_card_number}/{filename}'


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


class Employee(models.Model):
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    position = models.CharField(max_length=120)
    salary = models.DecimalField(max_digits=12, decimal_places=2)
    join_date = models.DateField()
    national_id_card_number = models.CharField(max_length=64, unique=True)
    email = models.EmailField(blank=True)
    contact_info = models.TextField(blank=True)
    mobile_number = models.CharField(max_length=32, blank=True)
    image = models.FileField(upload_to=employee_image_upload_path, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_employees',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('first_name', 'last_name', 'id')

    def __str__(self) -> str:
        return f'{self.first_name} {self.last_name}'.strip()
