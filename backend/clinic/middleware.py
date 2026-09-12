from __future__ import annotations


class AuditLogMiddleware:
    """Record successful data-changing API requests without retaining request data."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if (
            request.method not in {'POST', 'PUT', 'PATCH', 'DELETE'}
            or not request.path.startswith('/api/')
            or not 200 <= response.status_code < 300
        ):
            return response

        parts = [part for part in request.path[len('/api/'):].split('/') if part]
        if not parts or parts[0] in {'auth', 'audit-logs'}:
            return response
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return response

        from .models import AuditLog

        action = {
            'POST': AuditLog.Action.CREATE,
            'PUT': AuditLog.Action.UPDATE,
            'PATCH': AuditLog.Action.UPDATE,
            'DELETE': AuditLog.Action.DELETE,
        }[request.method]
        forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
        ip_address = (forwarded_for.split(',', 1)[0].strip() if forwarded_for else request.META.get('REMOTE_ADDR', '')) or None
        AuditLog.objects.create(
            actor=user,
            action=action,
            resource=parts[0],
            target_id=parts[1] if len(parts) > 1 and parts[1].isdigit() else '',
            endpoint=request.path[:255],
            status_code=response.status_code,
            ip_address=ip_address,
        )
        return response
