import pytest
from django.core.management import call_command
from django.utils import timezone

from oem.models import Product, ProductBaseline

pytestmark = pytest.mark.django_db


def test_seed_products_is_idempotent_and_preloads_nigerian_catalogue():
    call_command("seed_products")
    call_command("seed_products")
    slugs = set(Product.objects.values_list("slug", flat=True))
    assert {"cway-table-water-75cl", "gala-sausage-roll", "minimie-chinchin"} <= slugs
    assert Product.objects.count() == 9
    call_command("seed_products", "--no-demo")
    assert Product.objects.filter(sector="demo").count() == 2  # never deletes


def test_catalogue_is_public_and_marks_pending_products(api_client, model_version):
    call_command("seed_products", "--no-demo")
    res = api_client.get("/api/v1/products/")
    assert res.status_code == 200
    body = res.json()
    assert body["model_version"] == "1.0.0"
    assert len(body["products"]) == 7
    assert all(p["baseline"] is None for p in body["products"])
    assert set(body["products"][0]) == {
        "slug",
        "display_name",
        "manufacturer",
        "pack",
        "sector",
        "baseline",
    }


def test_catalogue_distributes_only_ready_baselines_for_active_model(
    api_client, model_version, oem_account
):
    from models_registry.models import ModelVersion

    call_command("seed_products", "--no-demo")
    old = ModelVersion.objects.create(
        version_string="0.9.0", tfjs_manifest_url="/x", is_active=False
    )
    common = dict(oem_account=oem_account, product_category="cway-table-water-75cl")
    ProductBaseline.objects.create(
        **common, model_version=old, status="ready", embedding_vector=[9.0] * 128
    )
    ProductBaseline.objects.create(**common, model_version=model_version, status="failed")
    ProductBaseline.objects.create(
        **common,
        model_version=model_version,
        status="ready",
        embedding_vector=[0.1] * 128,
        orb_descriptors_b64="AAAA",
        completed_at=timezone.now(),
    )
    ProductBaseline.objects.create(
        oem_account=oem_account,
        product_category="gala-sausage-roll",
        model_version=model_version,
        status="running",
    )
    products = {p["slug"]: p for p in api_client.get("/api/v1/products/").json()["products"]}
    cway = products["cway-table-water-75cl"]["baseline"]
    assert cway["embedding"] == [0.1] * 128 and cway["orb_descriptors_b64"] == "AAAA"
    assert cway["model_version"] == "1.0.0"
    assert products["gala-sausage-roll"]["baseline"] is None
    assert "image" not in str(cway).lower().replace("image_count", "")
