"""Business rules for reports."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..lab import repo as lab_repo
from ..patient import repo as patient_repo
from . import repo
from .model import Report


def create(data: dict) -> Report:
    report = Report(
        lab_id=int(data["lab_id"]),
        patient_id=int(data["patient_id"]),
        ready_on=parse_date(data["ready_on"]),
    )
    lab_repo.find(report.lab_id)
    patient_repo.find(report.patient_id)
    return repo.save(report)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_reports()
    return {
        "count": len(items),
        "latest_ready_on": max((i.ready_on for i in items), default=None),
    }


def overdue(reports: list | None = None, today=None) -> list:
    """Reports whose ready_on is in the past."""
    items = reports if reports is not None else repo.all_reports()
    return [i for i in items if is_past(i.ready_on, today)]
