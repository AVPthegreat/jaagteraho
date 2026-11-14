"""Where slots are kept."""

from ..core.store import Store
from .model import Slot

SLOTS = Store("slot")


def save(slot: Slot) -> Slot:
    return SLOTS.add(slot.validate())


def find(slot_id: int) -> Slot:
    return SLOTS.get(slot_id)


def all_slots() -> list[Slot]:
    return SLOTS.all()


def remove(slot_id: int) -> None:
    SLOTS.delete(slot_id)
