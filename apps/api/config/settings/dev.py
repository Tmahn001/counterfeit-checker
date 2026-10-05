from .base import *  # noqa

DEBUG = True
# Dev only: phones reach the stack on whatever LAN IP the Mac has today (`make https`).
ALLOWED_HOSTS = ["*"]
EXPOSE_API_DOCS = True
CORS_ALLOWED_ORIGINS = CORS_ALLOWED_ORIGINS or ["http://localhost:3000"]
CSRF_TRUSTED_ORIGINS = CSRF_TRUSTED_ORIGINS or ["http://localhost:3000"]
STORAGES["staticfiles"] = {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}
