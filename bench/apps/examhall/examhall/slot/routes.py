"""HTTP handlers for /api/slots."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_slot(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "exam_id", "hall_id", "on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_slots(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_slots()]
    return ok(paginate(rows, page, size))


def slot_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/slots"): create_slot,
    ("GET", "/api/slots"): list_slots,
    ("GET", "/api/slots/summary"): slot_summary,
}
