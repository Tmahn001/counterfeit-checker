import pytest
from django.contrib.auth import get_user_model

pytestmark = pytest.mark.django_db


def test_login_reports_roles_for_each_kind_of_user(
    api_client, nafdac_user, oem_admin_user, plain_user
):
    su = get_user_model().objects.create_superuser(
        "root@example.com", "root@example.com", "pw12345!x"
    )
    cases = [
        (su.email, {"staff", "nafdac"}),
        (nafdac_user.email, {"nafdac"}),
        (oem_admin_user.email, {"oem_admin"}),
        (plain_user.email, set()),
    ]
    for email, roles in cases:
        res = api_client.post("/api/v1/auth/login/", {"email": email, "password": "pw12345!x"})
        assert res.status_code == 200, res.content
        assert set(res.json()["roles"]) == roles
        assert res.json()["email"] == email
        assert "csrftoken" in res.cookies


def test_bad_credentials_and_anonymous_me(api_client, nafdac_user):
    assert (
        api_client.post(
            "/api/v1/auth/login/", {"email": nafdac_user.email, "password": "x"}
        ).status_code
        == 400
    )
    assert api_client.get("/api/v1/auth/me/").status_code == 403


def test_me_and_logout(api_client, nafdac_user):
    api_client.force_login(nafdac_user)
    assert api_client.get("/api/v1/auth/me/").json()["roles"] == ["nafdac"]
    assert api_client.post("/api/v1/auth/logout/").status_code == 204
    assert api_client.get("/api/v1/auth/me/").status_code == 403


def test_origin_settings_tolerate_trailing_slashes():
    import importlib
    import os

    os.environ["CSRF_TRUSTED_ORIGINS"] = "https://app.example/, https://other.example"
    os.environ["CORS_ALLOWED_ORIGINS"] = "https://app.example/"
    os.environ.setdefault("DJANGO_SECRET_KEY", "x")
    os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
    os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
    base = importlib.import_module("config.settings.base")
    base = importlib.reload(base)
    assert base.CSRF_TRUSTED_ORIGINS == ["https://app.example", "https://other.example"]
    assert base.CORS_ALLOWED_ORIGINS == ["https://app.example"]
