import pytest

pytestmark = pytest.mark.django_db


def test_login_returns_membership(api_client, oem_admin_user):
    res = api_client.post(
        "/api/v1/oem/auth/login/", {"email": "admin@oem.example", "password": "pw12345!x"}
    )
    assert res.status_code == 200
    assert res.json()["role"] == "admin"
    assert res.json()["account"]["company_name"] == "Demo Pharma"


def test_login_rejects_bad_password(api_client, oem_admin_user):
    res = api_client.post(
        "/api/v1/oem/auth/login/", {"email": "admin@oem.example", "password": "no"}
    )
    assert res.status_code == 400


def test_login_rejects_non_oem_user(api_client, plain_user):
    res = api_client.post(
        "/api/v1/oem/auth/login/", {"email": "nobody@example.com", "password": "pw12345!x"}
    )
    assert res.status_code == 403


def test_me_requires_session(api_client):
    assert api_client.get("/api/v1/oem/auth/me/").status_code == 403


def test_logout(api_client, oem_admin_user):
    api_client.force_login(oem_admin_user)
    assert api_client.post("/api/v1/oem/auth/logout/").status_code == 204
    assert api_client.get("/api/v1/oem/auth/me/").status_code == 403
