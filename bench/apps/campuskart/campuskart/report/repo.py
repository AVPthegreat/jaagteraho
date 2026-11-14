"""Where reports are kept."""

from ..core.store import Store
from .model import Report

REPORTS = Store("report")


def save(report: Report) -> Report:
    return REPORTS.add(report.validate())


def find(report_id: int) -> Report:
    return REPORTS.get(report_id)


def all_reports() -> list[Report]:
    return REPORTS.all()


def remove(report_id: int) -> None:
    REPORTS.delete(report_id)
