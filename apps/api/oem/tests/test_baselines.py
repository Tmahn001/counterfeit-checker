from unittest import mock

import pytest

from oem.models import ProductBaseline

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("product")]


def _upload(client, files, category="antimalarial_tablet_20mg"):
    return client.post(
        "/api/v1/oem/baselines/",
        {"product_category": category, "images": files},
        format="multipart",
    )


def test_upload_requires_uploader_role(api_client, plain_user, image_files, model_version):
    api_client.force_login(plain_user)
    assert _upload(api_client, image_files).status_code == 403


def test_upload_enqueues_job(
    api_client, oem_uploader_user, image_files, model_version, django_capture_on_commit_callbacks
):
    api_client.force_login(oem_uploader_user)
    with mock.patch("oem.views.generate_baseline_embedding.delay") as delay:
        with django_capture_on_commit_callbacks(execute=True):
            res = _upload(api_client, image_files)
    assert res.status_code == 202, res.content
    body = res.json()
    assert body["status"] == "pending"
    assert body["image_count"] == 5
    assert body["model_version"] == "1.0.0"
    delay.assert_called_once_with(body["id"])


def test_upload_requires_active_model(api_client, oem_uploader_user, image_files):
    api_client.force_login(oem_uploader_user)
    assert _upload(api_client, image_files).status_code == 409


def test_upload_requires_minimum_images(api_client, oem_uploader_user, image_files, model_version):
    api_client.force_login(oem_uploader_user)
    assert _upload(api_client, image_files[:2]).status_code == 400


def test_upload_rejects_invalid_category(api_client, oem_uploader_user, image_files, model_version):
    api_client.force_login(oem_uploader_user)
    assert _upload(api_client, image_files, category="not a slug!").status_code == 400
    # A well-formed slug that is not in the catalogue is rejected too.
    assert _upload(api_client, image_files, category="unknown-product").status_code == 400


def test_list_and_detail_scoped_to_account(
    api_client, oem_uploader_user, oem_admin_user, image_files, model_version
):
    api_client.force_login(oem_uploader_user)
    with mock.patch("oem.views.generate_baseline_embedding.delay"):
        created = _upload(api_client, image_files).json()
    res = api_client.get("/api/v1/oem/baselines/")
    assert res.status_code == 200 and len(res.json()) == 1
    detail = api_client.get(f"/api/v1/oem/baselines/{created['id']}/")
    assert detail.status_code == 200
    assert "embedding_vector" in detail.json()

    # Another account cannot see it.
    from django.contrib.auth import get_user_model

    from oem.models import OEMAccount, OEMMembership

    other = OEMAccount.objects.create(company_name="Other", contact_email="o@example.com")
    other_user = get_user_model().objects.create_user("o@example.com", password="x")
    OEMMembership.objects.create(user=other_user, account=other, role="admin")
    api_client.force_login(other_user)
    assert api_client.get(f"/api/v1/oem/baselines/{created['id']}/").status_code == 404


def test_task_marks_failed_when_ml_unavailable(oem_account, model_version, settings):
    baseline = ProductBaseline.objects.create(
        oem_account=oem_account, product_category="x", model_version=model_version
    )
    from oem.tasks import generate_baseline_embedding

    with mock.patch.dict(
        "sys.modules", {"authentic_edge_ml": None, "authentic_edge_ml.inference": None}
    ):
        with pytest.raises((ImportError, ModuleNotFoundError, AttributeError, TypeError)):
            generate_baseline_embedding.apply(args=[str(baseline.pk)]).get()
    baseline.refresh_from_db()
    assert baseline.status == ProductBaseline.Status.FAILED
    assert baseline.error_message


def test_task_success_path(oem_account, model_version):
    baseline = ProductBaseline.objects.create(
        oem_account=oem_account, product_category="x", model_version=model_version
    )
    fake_sig = mock.Mock(embedding=[0.1] * 128, orb_descriptors_b64="AAAA")
    fake_signer = mock.Mock()
    fake_signer.sign_image_set.return_value = fake_sig
    fake_module = mock.Mock()
    fake_module.BaselineSigner.from_model_version.return_value = fake_signer
    with mock.patch.dict(
        "sys.modules",
        {"authentic_edge_ml": mock.Mock(), "authentic_edge_ml.inference": fake_module},
    ):
        from oem.tasks import generate_baseline_embedding

        generate_baseline_embedding.apply(args=[str(baseline.pk)]).get()
    baseline.refresh_from_db()
    assert baseline.status == ProductBaseline.Status.READY
    assert len(baseline.embedding_vector) == 128
    assert baseline.completed_at is not None
