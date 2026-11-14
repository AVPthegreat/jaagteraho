"""Where medicines are kept."""

from ..core.store import Store
from .model import Medicine

MEDICINES = Store("medicine")


def save(medicine: Medicine) -> Medicine:
    return MEDICINES.add(medicine.validate())


def find(medicine_id: int) -> Medicine:
    return MEDICINES.get(medicine_id)


def all_medicines() -> list[Medicine]:
    return MEDICINES.all()


def remove(medicine_id: int) -> None:
    MEDICINES.delete(medicine_id)
