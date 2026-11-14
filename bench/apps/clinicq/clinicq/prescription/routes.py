"""HTTP handlers for /api/prescriptions."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_prescription(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "appointment_id", "notes", "days")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_prescriptions(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_prescriptions()]
    return ok(paginate(rows, page, size))


def prescription_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/prescriptions"): create_prescription,
    ("GET", "/api/prescriptions"): list_prescriptions,
    ("GET", "/api/prescriptions/summary"): prescription_summary,
}
