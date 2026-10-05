"""Session sign-in for the in-app admin console (regulator, staff and OEM users alike).

The OEM portal keeps its own endpoints under /api/v1/oem/auth/; these are role-agnostic and report
which areas of the console the signed-in user may see.
"""

from __future__ import annotations

from django.contrib.auth import login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import NAFDAC_GROUP
from oem.serializers import LoginSerializer


def roles_for(user) -> list[str]:  # type: ignore[no-untyped-def]
    """Console roles: ``staff`` (Django admin access), ``nafdac`` (aggregates), ``oem_*``."""
    roles: list[str] = []
    if user.is_superuser or user.is_staff:
        roles.append("staff")
    if user.is_superuser or user.groups.filter(name=NAFDAC_GROUP).exists():
        roles.append("nafdac")
    membership = getattr(user, "oem_membership", None)
    if membership is not None:
        roles.append(f"oem_{membership.role}")
    return roles


class SessionUserSerializer(serializers.Serializer):
    email = serializers.CharField()
    roles = serializers.ListField(child=serializers.CharField())


def _payload(user) -> dict[str, object]:  # type: ignore[no-untyped-def]
    return {"email": user.email or user.get_username(), "roles": roles_for(user)}


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []  # type: ignore[type-arg]

    @extend_schema(request=LoginSerializer, responses={200: SessionUserSerializer})
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        login(request._request, user)
        return Response(_payload(user))


class SessionLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None})
    def post(self, request: Request) -> Response:
        logout(request._request)
        return Response(status=204)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionMeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=SessionUserSerializer)
    def get(self, request: Request) -> Response:
        return Response(_payload(request.user))
