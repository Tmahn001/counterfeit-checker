"""Every serializer lists its fields explicitly — never ``fields = "__all__"`` (plan §11.6)."""

from __future__ import annotations

from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import OEMAccount, Product, ProductBaseline

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/tiff"}
MAX_IMAGES = 200
MIN_IMAGES = 5


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs: dict) -> dict:  # type: ignore[type-arg]
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["email"],
            password=attrs["password"],
        )
        if user is None or not user.is_active:
            raise serializers.ValidationError("Invalid credentials.")
        attrs["user"] = user
        return attrs


class OEMAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = OEMAccount
        fields = ("id", "company_name", "contact_email", "verified_at", "created_at")
        read_only_fields = fields


class MeSerializer(serializers.Serializer):
    email = serializers.EmailField(source="user.email")
    role = serializers.CharField()
    account = OEMAccountSerializer()


class ProductBaselineSerializer(serializers.ModelSerializer):
    image_count = serializers.IntegerField(source="images.count", read_only=True)
    model_version = serializers.CharField(source="model_version.version_string", read_only=True)

    class Meta:
        model = ProductBaseline
        fields = (
            "id",
            "product_category",
            "model_version",
            "status",
            "error_message",
            "image_count",
            "created_at",
            "completed_at",
        )
        read_only_fields = fields


class ProductBaselineDetailSerializer(ProductBaselineSerializer):
    class Meta(ProductBaselineSerializer.Meta):
        fields = ProductBaselineSerializer.Meta.fields + ("embedding_vector", "orb_descriptors_b64")
        read_only_fields = fields


class BaselineUploadSerializer(serializers.Serializer):
    """Multipart upload of a reference image set.

    This is the *only* image-accepting endpoint in the system and it is restricted to
    authenticated OEM uploaders (reference photos, not consumer scans).
    """

    product_category = serializers.SlugField(max_length=120)
    images = serializers.ListField(
        child=serializers.ImageField(), min_length=MIN_IMAGES, max_length=MAX_IMAGES
    )

    def validate_product_category(self, value: str) -> str:
        if not Product.objects.filter(slug=value, is_active=True).exists():
            raise serializers.ValidationError(
                "Unknown product. Register it in the product catalogue before uploading a baseline."
            )
        return value

    def validate_images(self, files: list) -> list:  # type: ignore[type-arg]
        for f in files:
            ctype = getattr(f, "content_type", None)
            if ctype and ctype not in ALLOWED_IMAGE_TYPES:
                raise serializers.ValidationError(f"Unsupported image type: {ctype}")
        return files


class PublicBaselineSerializer(serializers.ModelSerializer):
    """The signature a client needs to authenticate a product offline."""

    embedding = serializers.JSONField(source="embedding_vector")
    image_count = serializers.IntegerField(source="images.count")
    model_version = serializers.CharField(source="model_version.version_string")

    class Meta:
        model = ProductBaseline
        fields = (
            "embedding",
            "orb_descriptors_b64",
            "image_count",
            "model_version",
            "completed_at",
        )
        read_only_fields = fields


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ("slug", "display_name", "manufacturer", "pack", "sector")
        read_only_fields = fields
