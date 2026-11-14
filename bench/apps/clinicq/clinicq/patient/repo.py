"""Where patients are kept."""

from ..core.store import Store
from .model import Patient

PATIENTS = Store("patient")


def save(patient: Patient) -> Patient:
    return PATIENTS.add(patient.validate())


def find(patient_id: int) -> Patient:
    return PATIENTS.get(patient_id)


def all_patients() -> list[Patient]:
    return PATIENTS.all()


def remove(patient_id: int) -> None:
    PATIENTS.delete(patient_id)
