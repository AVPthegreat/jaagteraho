"""Where plagiarisms are kept."""

from ..core.store import Store
from .model import Plagiarism

PLAGIARISMS = Store("plagiarism")


def save(plagiarism: Plagiarism) -> Plagiarism:
    return PLAGIARISMS.add(plagiarism.validate())


def find(plagiarism_id: int) -> Plagiarism:
    return PLAGIARISMS.get(plagiarism_id)


def all_plagiarisms() -> list[Plagiarism]:
    return PLAGIARISMS.all()


def remove(plagiarism_id: int) -> None:
    PLAGIARISMS.delete(plagiarism_id)
