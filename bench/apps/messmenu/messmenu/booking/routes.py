"""HTTP handlers for /api/bookings."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_booking(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "student", "meal_id", "plates", "booked_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_bookings(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_bookings()]
    return ok(paginate(rows, page, size))


def booking_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/bookings"): create_booking,
    ("GET", "/api/bookings"): list_bookings,
    ("GET", "/api/bookings/summary"): booking_summary,
}
