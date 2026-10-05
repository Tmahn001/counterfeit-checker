"""Production settings (also used by Render; see render.yaml and docs/runbooks/deploy-render.md)."""

import os

from .base import *  # noqa

DEBUG = False
EXPOSE_API_DOCS = False

# Render injects the public hostname of the service; hosts from DJANGO_ALLOWED_HOSTS still apply.
_render_host = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if _render_host and _render_host not in ALLOWED_HOSTS:
    ALLOWED_HOSTS = [*ALLOWED_HOSTS, _render_host]

# TLS is terminated by the platform (Render, nginx); trust its forwarded-proto header.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
# Platform health checks arrive over plain HTTP inside the network and must get a 200, not a 301.
SECURE_REDIRECT_EXEMPT = [r"^api/v1/health/$"]
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# Optional: allow preview deployments (e.g. Vercel previews) to call the API cross-origin.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r for r in os.environ.get("CORS_ALLOWED_ORIGIN_REGEXES", "").split(",") if r.strip()
]
