"""Business rules for colleges."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import College


def create(data: dict) -> College:
    college = College(
        name=str(data["name"]).strip(),
        students=int(data["students"]),
        joined_on=parse_date(data["joined_on"]),
    )
    return repo.save(college)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_colleges()
    return {
        "count": len(items),
        "total_students": sum(i.students for i in items),
        "latest_joined_on": max((i.joined_on for i in items), default=None),
    }


def overdue(colleges: list | None = None, today=None) -> list:
    """Colleges whose joined_on is in the past."""
    items = colleges if colleges is not None else repo.all_colleges()
    return [i for i in items if is_past(i.joined_on, today)]
