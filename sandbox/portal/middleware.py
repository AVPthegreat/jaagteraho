"""Tags each request with the visitor's session, flow and exam switch, and allows the public site to call us."""

import re

import sentry_sdk
from django.conf import settings
from django.http import HttpResponse

SAFE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class TwinMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = request.headers.get("Origin", "")
        if request.method == "OPTIONS":
            response = HttpResponse(status=204)
        else:
            session = request.headers.get("X-JR-Session", "")
            if SAFE.match(session):
                sentry_sdk.set_tag("jr_session", session)
            sentry_sdk.set_tag("jr_exam", "on" if request.headers.get("X-JR-Exam") == "on" else "off")
            flow = request.path.strip("/").replace("api/", "").replace("/", "_") or "home"
            sentry_sdk.set_tag("jr_flow", flow)
            response = self.get_response(request)
        if origin in settings.JR_ALLOWED_ORIGINS:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Headers"] = "Content-Type, X-JR-Session, X-JR-Exam"
            response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response["Vary"] = "Origin"
        return response
