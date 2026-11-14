"""Business rules for visits."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..patient import repo as patient_repo
from . import repo
from .model import Visit


def create(data: dict) -> Visit:
    visit = Visit(
        patient_id=int(data["patient_id"]),
        on=parse_date(data["on"]),
        minutes=int(data["minutes"]),
    )
    patient_repo.find(visit.patient_id)
    return repo.save(visit)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_visits()
    return {
        "count": len(items),
        "total_minutes": sum(i.minutes for i in items),
        "latest_on": max((i.on for i in items), default=None),
    }


def overdue(visits: list | None = None, today=None) -> list:
    """Visits whose on is in the past."""
    items = visits if visits is not None else repo.all_visits()
    return [i for i in items if is_past(i.on, today)]
