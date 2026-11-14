"""Where colleges are kept."""

from ..core.store import Store
from .model import College

COLLEGES = Store("college")


def save(college: College) -> College:
    return COLLEGES.add(college.validate())


def find(college_id: int) -> College:
    return COLLEGES.get(college_id)


def all_colleges() -> list[College]:
    return COLLEGES.all()


def remove(college_id: int) -> None:
    COLLEGES.delete(college_id)
