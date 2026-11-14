"""HTTP handlers for /api/batches."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_batch(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "name", "college_id", "size")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_batches(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_batches()]
    return ok(paginate(rows, page, size))


def batch_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/batches"): create_batch,
    ("GET", "/api/batches"): list_batches,
    ("GET", "/api/batches/summary"): batch_summary,
}
