import pytest
from django.utils import timezone

from models_registry.models import ModelVersion

pytestmark = pytest.mark.django_db


def test_latest_404_without_active(api_client):
    assert api_client.get("/api/v1/models/latest/").status_code == 404


def test_latest_returns_active_version(api_client, model_version):
    ModelVersion.objects.create(
        version_string="1.1.0", tfjs_manifest_url="/models/v2/model.json", is_active=False
    )
    res = api_client.get("/api/v1/models/latest/")
    assert res.status_code == 200
    body = res.json()
    assert body["version_string"] == "1.0.0"
    assert body["tfjs_manifest_url"] == "/models/v1/model.json"
    assert set(body) == {
        "version_string",
        "release_notes",
        "tfjs_manifest_url",
        "baselines_url",
        "weights_sha256",
        "input_size",
        "embedding_dim",
        "margin",
        "published_at",
    }


def test_list_only_published(api_client, model_version):
    ModelVersion.objects.create(version_string="9.9.9", tfjs_manifest_url="/x", published_at=None)
    ModelVersion.objects.create(
        version_string="1.1.0", tfjs_manifest_url="/y", published_at=timezone.now()
    )
    res = api_client.get("/api/v1/models/")
    assert [v["version_string"] for v in res.json()] == ["1.1.0", "1.0.0"]


def test_health(api_client):
    assert api_client.get("/api/v1/health/").json() == {"status": "ok"}


def test_openapi_schema_generates(api_client):
    res = api_client.get("/api/v1/schema/?format=json")
    assert res.status_code == 200
    paths = res.json()["paths"]
    assert "/api/v1/telemetry/" in paths
    assert "/api/v1/models/latest/" in paths
    assert "/api/v1/oem/baselines/" in paths
    assert "/api/v1/dashboard/summary/" in paths
