"""URL configuration. All API routes are versioned under /api/v1/ (plan §11.4)."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from common.auth_views import SessionLoginView, SessionLogoutView, SessionMeView
from common.views import health
from oem.views import ProductCatalogueView

api_v1 = [
    path("health/", health, name="health"),
    path("auth/login/", SessionLoginView.as_view(), name="auth-login"),
    path("auth/logout/", SessionLogoutView.as_view(), name="auth-logout"),
    path("auth/me/", SessionMeView.as_view(), name="auth-me"),
    path("oem/", include("oem.urls")),
    path("products/", ProductCatalogueView.as_view(), name="products"),
    path("models/", include("models_registry.urls")),
    path("", include("telemetry.urls")),  # telemetry/ and dashboard/
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
]

if settings.EXPOSE_API_DOCS:
    api_v1.append(
        path(
            "schema/swagger-ui/",
            SpectacularSwaggerView.as_view(url_name="schema"),
            name="swagger-ui",
        )
    )

urlpatterns = [
    # The PWA owns /admin (its own console); Django's data console lives here.
    path("django-admin/", admin.site.urls),
    path("api/v1/", include((api_v1, "api"), namespace="v1")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
