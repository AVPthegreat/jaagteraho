"""Where complaints are kept."""

from ..core.store import Store
from .model import Complaint

COMPLAINTS = Store("complaint")


def save(complaint: Complaint) -> Complaint:
    return COMPLAINTS.add(complaint.validate())


def find(complaint_id: int) -> Complaint:
    return COMPLAINTS.get(complaint_id)


def all_complaints() -> list[Complaint]:
    return COMPLAINTS.all()


def remove(complaint_id: int) -> None:
    COMPLAINTS.delete(complaint_id)
