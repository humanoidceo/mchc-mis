from functools import wraps

from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied


def pharmacist_required(view_func):
    @login_required
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        user = request.user

        # Access is allowed for:
        # 1. Superusers
        # 2. Users inside Django group named "Pharmacist"
        if user.is_superuser or user.groups.filter(name="Pharmacist").exists():
            return view_func(request, *args, **kwargs)

        raise PermissionDenied("Only pharmacist accounts can access this page.")

    return wrapper
