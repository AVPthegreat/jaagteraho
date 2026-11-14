"""Where chats are kept."""

from ..core.store import Store
from .model import Chat

CHATS = Store("chat")


def save(chat: Chat) -> Chat:
    return CHATS.add(chat.validate())


def find(chat_id: int) -> Chat:
    return CHATS.get(chat_id)


def all_chats() -> list[Chat]:
    return CHATS.all()


def remove(chat_id: int) -> None:
    CHATS.delete(chat_id)
