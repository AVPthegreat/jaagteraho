"""Where doctors are kept."""

from ..core.store import Store
from .model import Doctor

DOCTORS = Store("doctor")


def save(doctor: Doctor) -> Doctor:
    return DOCTORS.add(doctor.validate())


def find(doctor_id: int) -> Doctor:
    return DOCTORS.get(doctor_id)


def all_doctors() -> list[Doctor]:
    return DOCTORS.all()


def remove(doctor_id: int) -> None:
    DOCTORS.delete(doctor_id)
