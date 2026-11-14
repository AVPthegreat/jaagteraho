"""Settings for the JaagteRaho sandbox twin: a tiny exam portal with faults planted on purpose."""

import os

import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration

BUILD = os.environ.get("JR_BUILD", "broken")  # "broken" or "fixed"; only used for the page label
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-not-secret")
DEBUG = False
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")

INSTALLED_APPS = ["portal"]
MIDDLEWARE = ["portal.middleware.TwinMiddleware"]
ROOT_URLCONF = "twin.urls"
WSGI_APPLICATION = "twin.wsgi.application"
DATABASES = {}
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "APP_DIRS": True}]
USE_TZ = True
TIME_ZONE = "Asia/Kolkata"

# Visitors' browsers call this app from the public website.
JR_ALLOWED_ORIGINS = [o for o in os.environ.get("JR_ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o]

if os.environ.get("SENTRY_DSN"):
    sentry_sdk.init(
        dsn=os.environ["SENTRY_DSN"],
        integrations=[DjangoIntegration(transaction_style="url")],
        send_default_pii=False,
        traces_sample_rate=0,
        release=os.environ.get("JR_RELEASE", "dev"),
        environment=f"sandbox-{BUILD}",
        in_app_include=["portal"],
    )
