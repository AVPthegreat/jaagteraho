"""Business rules for patients."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Patient


def create(data: dict) -> Patient:
    patient = Patient(
        name=str(data["name"]).strip(),
        age=int(data["age"]),
        joined_on=parse_date(data["joined_on"]),
    )
    return repo.save(patient)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_patients()
    return {
        "count": len(items),
        "total_age": sum(i.age for i in items),
        "latest_joined_on": max((i.joined_on for i in items), default=None),
    }


def overdue(patients: list | None = None, today=None) -> list:
    """Patients whose joined_on is in the past."""
    items = patients if patients is not None else repo.all_patients()
    return [i for i in items if is_past(i.joined_on, today)]
