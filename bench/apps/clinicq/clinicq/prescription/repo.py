"""Where prescriptions are kept."""

from ..core.store import Store
from .model import Prescription

PRESCRIPTIONS = Store("prescription")


def save(prescription: Prescription) -> Prescription:
    return PRESCRIPTIONS.add(prescription.validate())


def find(prescription_id: int) -> Prescription:
    return PRESCRIPTIONS.get(prescription_id)


def all_prescriptions() -> list[Prescription]:
    return PRESCRIPTIONS.all()


def remove(prescription_id: int) -> None:
    PRESCRIPTIONS.delete(prescription_id)
