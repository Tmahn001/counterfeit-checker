from django.contrib import admin

from .models import TelemetryEvent


@admin.register(TelemetryEvent)
class TelemetryEventAdmin(admin.ModelAdmin):
    list_display = (
        "received_at",
        "product_category",
        "verdict",
        "confidence_score",
        "state_code",
        "lga_code",
        "model_version_string",
        "backend",
    )
    list_filter = ("verdict", "product_category", "state_code", "backend")
    date_hierarchy = "received_at"
    readonly_fields = [f.name for f in TelemetryEvent._meta.fields]

    def has_add_permission(self, request):  # type: ignore[no-untyped-def]
        return False
