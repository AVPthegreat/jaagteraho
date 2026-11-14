"""Business rules for exams."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Exam


def create(data: dict) -> Exam:
    exam = Exam(
        title=str(data["title"]).strip(),
        duration_min=int(data["duration_min"]),
        starts_on=parse_date(data["starts_on"]),
        fee=to_money(data["fee"]),
    )
    return repo.save(exam)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_exams()
    return {
        "count": len(items),
        "total_fee": str(total(i.fee for i in items)),
        "average_fee": str(to_money(total(i.fee for i in items) / len(items))) if items else "0.00",
        "total_duration_min": sum(i.duration_min for i in items),
        "latest_starts_on": max((i.starts_on for i in items), default=None),
    }


def overdue(exams: list | None = None, today=None) -> list:
    """Exams whose starts_on is in the past."""
    items = exams if exams is not None else repo.all_exams()
    return [i for i in items if is_past(i.starts_on, today)]


def per_unit(exam_id: int):
    """fee per duration_min, for reports."""
    item = repo.find(exam_id)
    return to_money(item.fee / item.duration_min)
