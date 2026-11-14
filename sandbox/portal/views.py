"""The three flows a visitor can break, plus the portal page."""

import json

from django.conf import settings
from django.http import HttpResponseNotAllowed, JsonResponse
from django.shortcuts import render

from .exams import open_exam
from .payments import fee_after_coupons
from .submissions import prepare_submission


def _body(request):
    try:
        return json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return {}


def index(request):
    return render(request, "portal/index.html", {"build": settings.BUILD})


def health(request):
    return JsonResponse({"ok": True, "build": settings.BUILD})


def submit_code(request):
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    # The button always sends code; on purpose it never sends a language.
    data = _body(request)
    data.setdefault("code", "print('hello')")
    return JsonResponse(prepare_submission(data))


def start_exam(request):
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    return JsonResponse(open_exam())


def pay_fee(request):
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    return JsonResponse(fee_after_coupons(_body(request).get("coupons", [])))
