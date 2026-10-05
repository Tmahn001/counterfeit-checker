from .base import *  # noqa

DEBUG = False
EXPOSE_API_DOCS = True
SECRET_KEY = "test-only-secret-key"
# Tests run against a throwaway Postgres (CI service container / compose db); fall back to
# SQLite for quick local runs without a database.
if not env("DATABASE_URL", default=""):
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BROKER_URL = "memory://"
CELERY_RESULT_BACKEND = "cache+memory://"
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
MEDIA_ROOT = BASE_DIR / "media" / "test"
STORAGES["staticfiles"] = {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["telemetry"] = "1000/min"
