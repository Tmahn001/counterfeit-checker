from django.contrib import admin

from .models import BaselineImage, OEMAccount, OEMMembership, Product, ProductBaseline


@admin.register(OEMAccount)
class OEMAccountAdmin(admin.ModelAdmin):
    list_display = ("company_name", "contact_email", "verified_at", "created_at")
    search_fields = ("company_name", "contact_email")


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("display_name", "slug", "manufacturer", "pack", "sector", "is_active")
    list_filter = ("sector", "is_active")
    search_fields = ("display_name", "slug", "manufacturer")
    prepopulated_fields = {"slug": ("display_name",)}


@admin.register(OEMMembership)
class OEMMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "account", "role")
    list_filter = ("role",)


class BaselineImageInline(admin.TabularInline):
    model = BaselineImage
    extra = 0
    readonly_fields = ("image", "uploaded_at")


@admin.register(ProductBaseline)
class ProductBaselineAdmin(admin.ModelAdmin):
    list_display = ("product_category", "oem_account", "model_version", "status", "created_at")
    list_filter = ("status", "model_version")
    readonly_fields = ("embedding_vector", "orb_descriptors_b64", "task_id", "error_message")
    inlines = [BaselineImageInline]
