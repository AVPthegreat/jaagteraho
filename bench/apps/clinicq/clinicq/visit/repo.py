"""Where visits are kept."""

from ..core.store import Store
from .model import Visit

VISITS = Store("visit")


def save(visit: Visit) -> Visit:
    return VISITS.add(visit.validate())


def find(visit_id: int) -> Visit:
    return VISITS.get(visit_id)


def all_visits() -> list[Visit]:
    return VISITS.all()


def remove(visit_id: int) -> None:
    VISITS.delete(visit_id)
