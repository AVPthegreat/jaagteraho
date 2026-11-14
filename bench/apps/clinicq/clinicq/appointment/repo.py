"""Where appointments are kept."""

from ..core.store import Store
from .model import Appointment

APPOINTMENTS = Store("appointment")


def save(appointment: Appointment) -> Appointment:
    return APPOINTMENTS.add(appointment.validate())


def find(appointment_id: int) -> Appointment:
    return APPOINTMENTS.get(appointment_id)


def all_appointments() -> list[Appointment]:
    return APPOINTMENTS.all()


def remove(appointment_id: int) -> None:
    APPOINTMENTS.delete(appointment_id)
