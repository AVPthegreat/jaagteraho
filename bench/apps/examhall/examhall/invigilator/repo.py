"""Where invigilators are kept."""

from ..core.store import Store
from .model import Invigilator

INVIGILATORS = Store("invigilator")


def save(invigilator: Invigilator) -> Invigilator:
    return INVIGILATORS.add(invigilator.validate())


def find(invigilator_id: int) -> Invigilator:
    return INVIGILATORS.get(invigilator_id)


def all_invigilators() -> list[Invigilator]:
    return INVIGILATORS.all()


def remove(invigilator_id: int) -> None:
    INVIGILATORS.delete(invigilator_id)
