"""Business rules for notices."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Notice


def create(data: dict) -> Notice:
    notice = Notice(
        title=str(data["title"]).strip(),
        posted_on=parse_date(data["posted_on"]),
    )
    return repo.save(notice)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_notices()
    return {
        "count": len(items),
        "latest_posted_on": max((i.posted_on for i in items), default=None),
    }


def overdue(notices: list | None = None, today=None) -> list:
    """Notices whose posted_on is in the past."""
    items = notices if notices is not None else repo.all_notices()
    return [i for i in items if is_past(i.posted_on, today)]
