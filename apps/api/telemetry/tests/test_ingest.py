import pytest

from telemetry.models import TelemetryEvent

pytestmark = pytest.mark.django_db

VALID = {
    "product_category": "antimalarial_tablet_20mg",
    "verdict": "counterfeit",
    "model_confidence_score": 0.91,
    "distance": 1.42,
    "state_code": "LA",
    "lga_code": "LA-IKEJA",
    "geo_lat_2dp": "6.60",
    "geo_lng_2dp": "3.35",
    "model_version": "1.0.0",
    "backend": "wasm",
    "inference_ms": 312,
    "timestamp": "2026-09-18T10:00:00Z",
}


def test_ingest_valid_payload(api_client, model_version):
    res = api_client.post("/api/v1/telemetry/", VALID)
    assert res.status_code == 202, res.content
    event = TelemetryEvent.objects.get()
    assert event.model_version == model_version
    assert event.verdict == "counterfeit"
    assert str(event.geo_lat) == "6.60"


def test_ingest_without_geo(api_client):
    payload = {k: v for k, v in VALID.items() if not k.startswith(("geo_", "state", "lga"))}
    assert api_client.post("/api/v1/telemetry/", payload).status_code == 202


@pytest.mark.parametrize(
    "extra",
    [
        {"image": "iVBORw0KGgo="},
        {"photo_b64": "abc"},
        {"frame": "x"},
        {"gps_precise": "6.601234,3.351234"},
        {"latitude": 6.6},
        {"device_id": "abc"},
        {"unknown_field": 1},
        {"nested": {"a": 1}},
        {"note": "data:image/png;base64,iVBORw0KGgo="},
        {"note": "x" * 129},
    ],
)
def test_ingest_rejects_forbidden_and_unknown_fields(api_client, extra):
    res = api_client.post("/api/v1/telemetry/", {**VALID, **extra})
    assert res.status_code == 400, res.content


@pytest.mark.parametrize(
    "field,value",
    [
        ("model_confidence_score", 1.5),
        ("model_confidence_score", -0.1),
        ("verdict", "maybe"),
        ("model_version", "v1"),
        ("state_code", "Lagos"),
        ("lga_code", "ikeja"),
        ("geo_lat_2dp", "6.601"),
        ("product_category", "has space"),
        ("backend", "cuda"),
    ],
)
def test_ingest_validates_values(api_client, field, value):
    assert api_client.post("/api/v1/telemetry/", {**VALID, field: value}).status_code == 400


def test_ingest_requires_geo_pair(api_client):
    payload = dict(VALID)
    payload.pop("geo_lng_2dp")
    assert api_client.post("/api/v1/telemetry/", payload).status_code == 400


def test_ingest_is_rate_limited(api_client, settings):
    from django.core.cache import cache

    from telemetry.views import TelemetryThrottle

    cache.clear()  # throttle history from earlier tests must not bleed in
    original = dict(TelemetryThrottle.THROTTLE_RATES)
    TelemetryThrottle.THROTTLE_RATES = {**original, "telemetry": "2/min"}
    try:
        assert api_client.post("/api/v1/telemetry/", VALID).status_code == 202
        assert api_client.post("/api/v1/telemetry/", VALID).status_code == 202
        assert api_client.post("/api/v1/telemetry/", VALID).status_code == 429
    finally:
        TelemetryThrottle.THROTTLE_RATES = original
        cache.clear()
