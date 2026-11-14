"""Business rules for slots."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..exam import repo as exam_repo
from ..hall import repo as hall_repo
from . import repo
from .model import Slot


def create(data: dict) -> Slot:
    slot = Slot(
        exam_id=int(data["exam_id"]),
        hall_id=int(data["hall_id"]),
        on=parse_date(data["on"]),
    )
    exam_repo.find(slot.exam_id)
    hall_repo.find(slot.hall_id)
    return repo.save(slot)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_slots()
    return {
        "count": len(items),
        "latest_on": max((i.on for i in items), default=None),
    }


def overdue(slots: list | None = None, today=None) -> list:
    """Slots whose on is in the past."""
    items = slots if slots is not None else repo.all_slots()
    return [i for i in items if is_past(i.on, today)]
