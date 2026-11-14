"""Business rules for appointments."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..doctor import repo as doctor_repo
from ..patient import repo as patient_repo
from . import repo
from .model import Appointment


def create(data: dict) -> Appointment:
    appointment = Appointment(
        patient_id=int(data["patient_id"]),
        doctor_id=int(data["doctor_id"]),
        on=parse_date(data["on"]),
        token=int(data["token"]),
    )
    patient_repo.find(appointment.patient_id)
    doctor_repo.find(appointment.doctor_id)
    return repo.save(appointment)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_appointments()
    return {
        "count": len(items),
        "total_token": sum(i.token for i in items),
        "latest_on": max((i.on for i in items), default=None),
    }


def overdue(appointments: list | None = None, today=None) -> list:
    """Appointments whose on is in the past."""
    items = appointments if appointments is not None else repo.all_appointments()
    return [i for i in items if is_past(i.on, today)]
