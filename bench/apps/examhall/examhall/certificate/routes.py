"""HTTP handlers for /api/certificates."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_certificate(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "result_id", "issued_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_certificates(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_certificates()]
    return ok(paginate(rows, page, size))


def certificate_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/certificates"): create_certificate,
    ("GET", "/api/certificates"): list_certificates,
    ("GET", "/api/certificates/summary"): certificate_summary,
}
