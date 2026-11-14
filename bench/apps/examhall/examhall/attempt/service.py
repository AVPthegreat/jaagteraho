"""Business rules for attempts."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..exam import repo as exam_repo
from ..student import repo as student_repo
from . import repo
from .model import Attempt


def create(data: dict) -> Attempt:
    attempt = Attempt(
        exam_id=int(data["exam_id"]),
        student_id=int(data["student_id"]),
        started_on=parse_date(data["started_on"]),
        answered=int(data["answered"]),
    )
    exam_repo.find(attempt.exam_id)
    student_repo.find(attempt.student_id)
    return repo.save(attempt)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_attempts()
    return {
        "count": len(items),
        "total_answered": sum(i.answered for i in items),
        "latest_started_on": max((i.started_on for i in items), default=None),
    }


def overdue(attempts: list | None = None, today=None) -> list:
    """Attempts whose started_on is in the past."""
    items = attempts if attempts is not None else repo.all_attempts()
    return [i for i in items if is_past(i.started_on, today)]
