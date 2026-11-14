"""Tiny request and response helpers shared by every route."""

from .errors import AppError, ValidationError


def require_fields(body: dict, *names: str) -> None:
    missing = [n for n in names if body.get(n) in (None, "")]
    if missing:
        raise ValidationError("missing: " + ", ".join(missing))


def ok(data, status: int = 200) -> dict:
    return {"status": status, "data": data}


def fail(error: AppError) -> dict:
    return {"status": error.status, "error": str(error)}


def query_int(request: dict, name: str, default: int) -> int:
    value = request.get("query", {}).get(name)
    return int(value) if value not in (None, "") else default
