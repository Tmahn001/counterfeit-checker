"""Role-based permissions (plan §11.3).

OEM roles are stored per-membership (``oem.OEMMembership.role``); NAFDAC dashboard users are
members of the ``nafdac`` Django group and have read-only access to aggregated telemetry.
"""

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

NAFDAC_GROUP = "nafdac"


def _membership(request: Request):  # type: ignore[no-untyped-def]
    user = request.user
    if not user or not user.is_authenticated:
        return None
    return getattr(user, "oem_membership", None)


class IsOEMMember(BasePermission):
    """Any authenticated user attached to an OEM account (uploader or admin)."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        return _membership(request) is not None


class IsOEMAdmin(BasePermission):
    def has_permission(self, request: Request, view: APIView) -> bool:
        m = _membership(request)
        return m is not None and m.role == "admin"


class IsOEMUploader(BasePermission):
    """Admins can do everything an uploader can."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        m = _membership(request)
        return m is not None and m.role in {"admin", "uploader"}


class IsNAFDACUser(BasePermission):
    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_superuser or user.groups.filter(name=NAFDAC_GROUP).exists())
        )
