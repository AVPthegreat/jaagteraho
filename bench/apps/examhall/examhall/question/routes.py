"""HTTP handlers for /api/questions."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_question(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "exam_id", "text", "marks")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_questions(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_questions()]
    return ok(paginate(rows, page, size))


def question_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/questions"): create_question,
    ("GET", "/api/questions"): list_questions,
    ("GET", "/api/questions/summary"): question_summary,
}
