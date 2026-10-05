from django.urls import path

from . import views

urlpatterns = [
    path("telemetry/", views.TelemetryIngestView.as_view(), name="telemetry-ingest"),
    path("dashboard/summary/", views.DashboardSummaryView.as_view(), name="dashboard-summary"),
]
