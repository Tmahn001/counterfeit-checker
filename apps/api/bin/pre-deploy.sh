#!/bin/bash
# Render pre-deploy command (runs in the new image before it goes live; no shell wraps it, hence a script).
set -euo pipefail
python manage.py migrate --noinput
python manage.py bootstrap
