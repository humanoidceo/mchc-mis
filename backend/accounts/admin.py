from django.contrib import admin

from .models import Employee, StaffProfile


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'phone', 'updated_at')
    list_filter = ('role',)
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'phone')


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'last_name', 'position', 'salary', 'join_date', 'mobile_number')
    search_fields = ('first_name', 'last_name', 'position', 'national_id_card_number', 'email', 'mobile_number')
    list_filter = ('position', 'join_date')
