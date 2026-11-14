"""Where labs are kept."""

from ..core.store import Store
from .model import Lab

LABS = Store("lab")


def save(lab: Lab) -> Lab:
    return LABS.add(lab.validate())


def find(lab_id: int) -> Lab:
    return LABS.get(lab_id)


def all_labs() -> list[Lab]:
    return LABS.all()


def remove(lab_id: int) -> None:
    LABS.delete(lab_id)
