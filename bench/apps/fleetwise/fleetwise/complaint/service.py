"""Business rules for complaints."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..trip import repo as trip_repo
from . import repo
from .model import Complaint


def create(data: dict) -> Complaint:
    complaint = Complaint(
        text=str(data["text"]).strip(),
        trip_id=int(data["trip_id"]),
        filed_on=parse_date(data["filed_on"]),
    )
    trip_repo.find(complaint.trip_id)
    return repo.save(complaint)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_complaints()
    return {
        "count": len(items),
        "latest_filed_on": max((i.filed_on for i in items), default=None),
    }


def overdue(complaints: list | None = None, today=None) -> list:
    """Complaints whose filed_on is in the past."""
    items = complaints if complaints is not None else repo.all_complaints()
    return [i for i in items if is_past(i.filed_on, today)]
