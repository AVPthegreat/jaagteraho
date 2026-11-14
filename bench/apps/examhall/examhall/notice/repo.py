"""Where notices are kept."""

from ..core.store import Store
from .model import Notice

NOTICES = Store("notice")


def save(notice: Notice) -> Notice:
    return NOTICES.add(notice.validate())


def find(notice_id: int) -> Notice:
    return NOTICES.get(notice_id)


def all_notices() -> list[Notice]:
    return NOTICES.all()


def remove(notice_id: int) -> None:
    NOTICES.delete(notice_id)
