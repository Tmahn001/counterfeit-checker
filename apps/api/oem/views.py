from __future__ import annotations

from django.contrib.auth import login, logout
from django.db import transaction
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsOEMMember, IsOEMUploader
from models_registry.models import ModelVersion

from .models import BaselineImage, Product, ProductBaseline
from .serializers import (
    BaselineUploadSerializer,
    LoginSerializer,
    MeSerializer,
    ProductBaselineDetailSerializer,
    ProductBaselineSerializer,
    ProductSerializer,
    PublicBaselineSerializer,
)
from .tasks import generate_baseline_embedding


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []  # type: ignore[type-arg]

    @extend_schema(request=LoginSerializer, responses={200: MeSerializer, 400: OpenApiResponse()})
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        membership = getattr(user, "oem_membership", None)
        if membership is None:
            return Response(
                {
                    "detail": "This account is not attached to a manufacturer (OEM). Sign in "
                    "with an OEM account, or ask a site administrator to add an OEM "
                    "membership for you."
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        login(request._request, user)
        return Response(MeSerializer(membership).data)


class LogoutView(APIView):
    permission_classes = [IsOEMMember]

    @extend_schema(request=None, responses={204: None})
    def post(self, request: Request) -> Response:
        logout(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsOEMMember]

    @extend_schema(responses=MeSerializer)
    def get(self, request: Request) -> Response:
        return Response(MeSerializer(request.user.oem_membership).data)


class BaselineListCreateView(APIView):
    permission_classes = [IsOEMUploader]

    @extend_schema(responses=ProductBaselineSerializer(many=True))
    def get(self, request: Request) -> Response:
        qs = ProductBaseline.objects.filter(
            oem_account=request.user.oem_membership.account
        ).select_related("model_version")
        return Response(ProductBaselineSerializer(qs, many=True).data)

    @extend_schema(
        request={"multipart/form-data": BaselineUploadSerializer},
        responses={202: ProductBaselineSerializer},
        description="Upload a reference macro-photo set and enqueue embedding generation.",
    )
    def post(self, request: Request) -> Response:
        serializer = BaselineUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        model_version = (
            ModelVersion.objects.filter(is_active=True).order_by("-published_at").first()
        )
        if model_version is None:
            return Response(
                {"detail": "No active model version is registered."},
                status=status.HTTP_409_CONFLICT,
            )
        with transaction.atomic():
            baseline = ProductBaseline.objects.create(
                oem_account=request.user.oem_membership.account,
                product_category=serializer.validated_data["product_category"],
                model_version=model_version,
            )
            BaselineImage.objects.bulk_create(
                [
                    BaselineImage(baseline=baseline, image=f)
                    for f in serializer.validated_data["images"]
                ]
            )
            transaction.on_commit(lambda: generate_baseline_embedding.delay(str(baseline.pk)))
        return Response(ProductBaselineSerializer(baseline).data, status=status.HTTP_202_ACCEPTED)


class BaselineDetailView(APIView):
    """Status polling endpoint for an enqueued baseline job."""

    permission_classes = [IsOEMMember]

    @extend_schema(responses=ProductBaselineDetailSerializer)
    def get(self, request: Request, pk: str) -> Response:
        try:
            baseline = ProductBaseline.objects.select_related("model_version").get(
                pk=pk, oem_account=request.user.oem_membership.account
            )
        except ProductBaseline.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(ProductBaselineDetailSerializer(baseline).data)


class ProductCatalogueView(APIView):
    """Public catalogue + distributed baseline signatures.

    Clients call this when online to learn which products exist and to pick up signatures generated
    from OEM reference sets. Only READY baselines for the active model version are distributed (the
    newest per product). Signatures are embeddings and ORB descriptors — never images.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []  # type: ignore[type-arg]

    @extend_schema(responses={200: OpenApiResponse(description="Catalogue with baselines")})
    def get(self, request: Request) -> Response:
        active = ModelVersion.objects.filter(is_active=True).order_by("-published_at").first()
        latest: dict[str, ProductBaseline] = {}
        if active is not None:
            ready = (
                ProductBaseline.objects.filter(
                    status=ProductBaseline.Status.READY, model_version=active
                )
                .select_related("model_version")
                .order_by("completed_at")
            )
            for baseline in ready:
                latest[baseline.product_category] = baseline  # later (newer) wins
        products = []
        for product in Product.objects.filter(is_active=True):
            entry = dict(ProductSerializer(product).data)
            baseline = latest.get(product.slug)
            entry["baseline"] = PublicBaselineSerializer(baseline).data if baseline else None
            products.append(entry)
        return Response(
            {"model_version": active.version_string if active else None, "products": products}
        )
