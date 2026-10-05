from django.contrib import admin

from .models import ModelVersion


@admin.register(ModelVersion)
class ModelVersionAdmin(admin.ModelAdmin):
    list_display = ("version_string", "is_active", "published_at", "tfjs_manifest_url", "margin")
    list_filter = ("is_active",)
    actions = ["activate"]

    @admin.action(description="Activate selected version (deactivates all others)")
    def activate(self, request, queryset):  # type: ignore[no-untyped-def]
        version = queryset.first()
        if version is None:
            return
        ModelVersion.objects.update(is_active=False)
        version.is_active = True
        version.save(update_fields=["is_active"])
