"""Telemetry ingestion serializer.

Security posture (plan §11.3/§13): explicit field allowlist, unknown fields rejected, and any
value that looks like binary/base64/data-URI/image content is rejected at the serializer level —
not by convention.
"""

from __future__ import annotations

import re
from typing import Any

from rest_framework import serializers

from models_registry.models import ModelVersion

from .models import TelemetryEvent

FORBIDDEN_KEYS = re.compile(
    r"(image|photo|picture|frame|jpeg|jpg|png|bitmap|base64|blob|bytes|pixels|"
    r"gps|latitude|longitude|imei|device_id|serial|mac|ip)",
    re.IGNORECASE,
)
DATA_URI = re.compile(r"^\s*data:", re.IGNORECASE)
MAX_STRING_LEN = 128


class StrictSerializer(serializers.Serializer):
    """Reject unknown keys instead of silently dropping them."""

    def to_internal_value(self, data: Any) -> Any:
        if not isinstance(data, dict):
            raise serializers.ValidationError("Expected an object.")
        unknown = set(data.keys()) - set(self.fields.keys())
        if unknown:
            raise serializers.ValidationError(
                {k: "Unknown field — telemetry payloads are strictly allowlisted." for k in unknown}
            )
        return super().to_internal_value(data)


class TelemetryEventSerializer(StrictSerializer):
    product_category = serializers.SlugField(max_length=120)
    verdict = serializers.ChoiceField(choices=TelemetryEvent.Verdict.choices)
    model_confidence_score = serializers.FloatField(min_value=0.0, max_value=1.0)
    distance = serializers.FloatField(min_value=0.0, required=False, allow_null=True)
    state_code = serializers.RegexField(r"^[A-Z]{2}$", required=False, allow_blank=True, default="")
    lga_code = serializers.RegexField(
        r"^[A-Z]{2}-[A-Z0-9_]{2,12}$", required=False, allow_blank=True, default=""
    )
    geo_lat_2dp = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True, default=None
    )
    geo_lng_2dp = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True, default=None
    )
    model_version = serializers.RegexField(r"^\d+\.\d+\.\d+(-[a-z0-9.]+)?$", max_length=32)
    backend = serializers.ChoiceField(
        choices=["webgl", "wasm", "cpu", "webgpu"], required=False, default=""
    )
    inference_ms = serializers.IntegerField(min_value=0, max_value=600_000, required=False)
    timestamp = serializers.DateTimeField()

    def to_internal_value(self, data: Any) -> Any:
        if isinstance(data, dict):
            for key, value in data.items():
                if FORBIDDEN_KEYS.search(str(key)):
                    raise serializers.ValidationError({key: "Field is not permitted in telemetry."})
                if isinstance(value, bytes | bytearray | memoryview):
                    raise serializers.ValidationError({key: "Binary values are not permitted."})
                if isinstance(value, dict | list):
                    raise serializers.ValidationError({key: "Nested values are not permitted."})
                if isinstance(value, str) and (
                    len(value) > MAX_STRING_LEN or DATA_URI.match(value)
                ):
                    raise serializers.ValidationError(
                        {key: "Value rejected (too long or data URI)."}
                    )
        return super().to_internal_value(data)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        lat, lng = attrs.get("geo_lat_2dp"), attrs.get("geo_lng_2dp")
        if (lat is None) != (lng is None):
            raise serializers.ValidationError("geo_lat_2dp and geo_lng_2dp must be sent together.")
        if lat is not None and not (-90 <= lat <= 90 and -180 <= lng <= 180):  # type: ignore[operator]
            raise serializers.ValidationError("Coordinates out of range.")
        return attrs

    def create(self, validated: dict[str, Any]) -> TelemetryEvent:
        version_string = validated["model_version"]
        return TelemetryEvent.objects.create(
            product_category=validated["product_category"],
            verdict=validated["verdict"],
            confidence_score=validated["model_confidence_score"],
            distance=validated.get("distance"),
            state_code=validated.get("state_code", ""),
            lga_code=validated.get("lga_code", ""),
            geo_lat=validated.get("geo_lat_2dp"),
            geo_lng=validated.get("geo_lng_2dp"),
            model_version=ModelVersion.objects.filter(version_string=version_string).first(),
            model_version_string=version_string,
            backend=validated.get("backend", ""),
            inference_ms=validated.get("inference_ms"),
            client_timestamp=validated["timestamp"],
        )


class DashboardCellSerializer(serializers.Serializer):
    product_category = serializers.CharField()
    state_code = serializers.CharField()
    verdict = serializers.CharField()
    count = serializers.IntegerField()
    mean_confidence = serializers.FloatField()


class DashboardSummarySerializer(serializers.Serializer):
    since = serializers.DateTimeField()
    total_events = serializers.IntegerField()
    counterfeit_rate = serializers.FloatField()
    k_anonymity = serializers.IntegerField()
    by_category_state = DashboardCellSerializer(many=True)
    by_model_version = serializers.DictField(child=serializers.IntegerField())
