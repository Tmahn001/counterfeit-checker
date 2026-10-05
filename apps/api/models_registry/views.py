from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ModelVersion
from .serializers import ModelVersionSerializer


class LatestModelView(APIView):
    """Public, read-only: the manifest URL the Service Worker checks for cache refresh."""

    permission_classes = [AllowAny]
    authentication_classes: list = []  # type: ignore[type-arg]

    @extend_schema(responses={200: ModelVersionSerializer, 404: None})
    def get(self, request: Request) -> Response:
        version = ModelVersion.objects.filter(is_active=True).order_by("-published_at").first()
        if version is None:
            return Response({"detail": "No active model."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ModelVersionSerializer(version).data)


class ModelVersionListView(APIView):
    """Public changelog of published versions."""

    permission_classes = [AllowAny]
    authentication_classes: list = []  # type: ignore[type-arg]

    @extend_schema(responses=ModelVersionSerializer(many=True))
    def get(self, request: Request) -> Response:
        qs = ModelVersion.objects.filter(published_at__isnull=False)
        return Response(ModelVersionSerializer(qs, many=True).data)
