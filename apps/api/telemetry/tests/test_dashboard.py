import pytest
from django.utils import timezone

from telemetry.models import TelemetryEvent

pytestmark = pytest.mark.django_db


def _event(**kw):
    base = dict(
        product_category="cat_a",
        verdict="counterfeit",
        confidence_score=0.9,
        state_code="LA",
        lga_code="LA-IKEJA",
        model_version_string="1.0.0",
        client_timestamp=timezone.now(),
    )
    base.update(kw)
    return TelemetryEvent.objects.create(**base)


def test_dashboard_requires_nafdac_role(api_client, oem_admin_user, plain_user):
    assert api_client.get("/api/v1/dashboard/summary/").status_code == 403
    api_client.force_login(plain_user)
    assert api_client.get("/api/v1/dashboard/summary/").status_code == 403
    api_client.force_login(oem_admin_user)
    assert api_client.get("/api/v1/dashboard/summary/").status_code == 403


def test_dashboard_suppresses_small_cells(api_client, nafdac_user, settings):
    settings.DASHBOARD_K_ANONYMITY = 5
    for _ in range(6):
        _event()
    for _ in range(2):
        _event(state_code="KN", lga_code="KN-NASSARAWA")  # below k → suppressed
    _event(verdict="authentic", confidence_score=0.2)
    api_client.force_login(nafdac_user)
    res = api_client.get("/api/v1/dashboard/summary/?days=7")
    assert res.status_code == 200
    body = res.json()
    assert body["total_events"] == 9
    assert body["k_anonymity"] == 5
    assert body["counterfeit_rate"] == pytest.approx(8 / 9)
    cells = body["by_category_state"]
    assert len(cells) == 1
    assert cells[0]["state_code"] == "LA" and cells[0]["count"] == 6
    assert body["by_model_version"] == {"1.0.0": 9}


def test_dashboard_days_param_clamped(api_client, nafdac_user):
    api_client.force_login(nafdac_user)
    assert api_client.get("/api/v1/dashboard/summary/?days=abc").status_code == 200
    assert api_client.get("/api/v1/dashboard/summary/?days=99999").status_code == 200
