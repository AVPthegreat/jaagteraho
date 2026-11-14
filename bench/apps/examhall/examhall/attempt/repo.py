"""Where attempts are kept."""

from ..core.store import Store
from .model import Attempt

ATTEMPTS = Store("attempt")


def save(attempt: Attempt) -> Attempt:
    return ATTEMPTS.add(attempt.validate())


def find(attempt_id: int) -> Attempt:
    return ATTEMPTS.get(attempt_id)


def all_attempts() -> list[Attempt]:
    return ATTEMPTS.all()


def remove(attempt_id: int) -> None:
    ATTEMPTS.delete(attempt_id)
