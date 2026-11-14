"""Business rules for prescriptions."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..appointment import repo as appointment_repo
from . import repo
from .model import Prescription


def create(data: dict) -> Prescription:
    prescription = Prescription(
        appointment_id=int(data["appointment_id"]),
        notes=str(data["notes"]).strip(),
        days=int(data["days"]),
    )
    appointment_repo.find(prescription.appointment_id)
    return repo.save(prescription)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_prescriptions()
    return {
        "count": len(items),
        "total_days": sum(i.days for i in items),
    }
