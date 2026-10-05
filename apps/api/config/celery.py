"""Celery application. Tasks are auto-discovered from each installed app's ``tasks`` module."""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("authentic_edge")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
