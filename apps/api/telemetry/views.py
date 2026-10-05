from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.db.models import Avg, Count
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from common.permissions import IsNAFDACUser

from .models import TelemetryEvent
from .serializers import DashboardSummarySerializer, TelemetryEventSerializer

log = logging.getLogger(__name__)


class TelemetryThrottle(AnonRateThrottle):
    scope = "telemetry"


class TelemetryIngestView(APIView):
    """Anonymized incident ingestion: unauthenticated, rate-limited, strictly schema-validated."""

    permission_classes = [AllowAny]
    authentication_classes: list = []  # type: ignore[type-arg]
    throttle_classes = [TelemetryThrottle]

    @extend_schema(request=TelemetryEventSerializer, responses={202: None, 400: None, 429: None})
    def post(self, request: Request) -> Response:
        serializer = TelemetryEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = serializer.save()
        log.info(
            "telemetry ingested",
            extra={
                "product_category": event.product_category,
                "verdict": event.verdict,
                "model_version": event.model_version_string,
                "state_code": event.state_code,
            },
        )
        return Response(status=status.HTTP_202_ACCEPTED)


class DashboardSummaryView(APIView):
    """NAFDAC-facing aggregates.

    Cells with fewer than ``DASHBOARD_K_ANONYMITY`` events are suppressed so small markets cannot
    be de-anonymized (plan §11.3).
    """

    permission_classes = [IsNAFDACUser]

    @extend_schema(
        parameters=[OpenApiParameter("days", int, description="Window in days (default 30)")],
        responses=DashboardSummarySerializer,
    )
    def get(self, request: Request) -> Response:
        try:
            days = max(1, min(int(request.query_params.get("days", 30)), 365))
        except ValueError:
            days = 30
        since = timezone.now() - timedelta(days=days)
        k = settings.DASHBOARD_K_ANONYMITY
        qs = TelemetryEvent.objects.filter(received_at__gte=since)
        total = qs.count()
        counterfeit = qs.filter(verdict=TelemetryEvent.Verdict.COUNTERFEIT).count()
        cells = (
            qs.values("product_category", "state_code", "verdict")
            .annotate(count=Count("id"), mean_confidence=Avg("confidence_score"))
            .filter(count__gte=k)
            .order_by("-count")
        )
        by_version = {
            row["model_version_string"]: row["n"]
            for row in qs.values("model_version_string").annotate(n=Count("id"))
        }
        payload = {
            "since": since,
            "total_events": total,
            "counterfeit_rate": (counterfeit / total) if total else 0.0,
            "k_anonymity": k,
            "by_category_state": list(cells),
            "by_model_version": by_version,
        }
        return Response(DashboardSummarySerializer(payload).data)
