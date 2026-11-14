"""Business rules for categories."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Category


def create(data: dict) -> Category:
    category = Category(
        name=str(data["name"]).strip(),
        items=int(data["items"]),
    )
    return repo.save(category)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_categories()
    return {
        "count": len(items),
        "total_items": sum(i.items for i in items),
    }
