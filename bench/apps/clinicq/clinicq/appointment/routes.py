"""HTTP handlers for /api/appointments."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_appointment(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "patient_id", "doctor_id", "on", "token")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_appointments(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_appointments()]
    return ok(paginate(rows, page, size))


def appointment_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/appointments"): create_appointment,
    ("GET", "/api/appointments"): list_appointments,
    ("GET", "/api/appointments/summary"): appointment_summary,
}
