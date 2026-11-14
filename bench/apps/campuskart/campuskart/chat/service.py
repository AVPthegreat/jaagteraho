"""Business rules for chats."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..listing import repo as listing_repo
from . import repo
from .model import Chat


def create(data: dict) -> Chat:
    chat = Chat(
        listing_id=int(data["listing_id"]),
        messages=int(data["messages"]),
        started_on=parse_date(data["started_on"]),
    )
    listing_repo.find(chat.listing_id)
    return repo.save(chat)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_chats()
    return {
        "count": len(items),
        "total_messages": sum(i.messages for i in items),
        "latest_started_on": max((i.started_on for i in items), default=None),
    }


def overdue(chats: list | None = None, today=None) -> list:
    """Chats whose started_on is in the past."""
    items = chats if chats is not None else repo.all_chats()
    return [i for i in items if is_past(i.started_on, today)]
