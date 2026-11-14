"""HTTP handlers for /api/buspasses."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_buspass(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "student", "route_id", "price", "valid_until")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_buspasses(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_buspasses()]
    return ok(paginate(rows, page, size))


def buspass_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/buspasses"): create_buspass,
    ("GET", "/api/buspasses"): list_buspasses,
    ("GET", "/api/buspasses/summary"): buspass_summary,
}
