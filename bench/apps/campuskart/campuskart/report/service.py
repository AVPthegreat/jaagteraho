"""Business rules for reports."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..listing import repo as listing_repo
from . import repo
from .model import Report


def create(data: dict) -> Report:
    report = Report(
        listing_id=int(data["listing_id"]),
        reason=str(data["reason"]).strip(),
        filed_on=parse_date(data["filed_on"]),
    )
    listing_repo.find(report.listing_id)
    return repo.save(report)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_reports()
    return {
        "count": len(items),
        "latest_filed_on": max((i.filed_on for i in items), default=None),
    }


def overdue(reports: list | None = None, today=None) -> list:
    """Reports whose filed_on is in the past."""
    items = reports if reports is not None else repo.all_reports()
    return [i for i in items if is_past(i.filed_on, today)]
