"""Where categories are kept."""

from ..core.store import Store
from .model import Category

CATEGORIES = Store("category")


def save(category: Category) -> Category:
    return CATEGORIES.add(category.validate())


def find(category_id: int) -> Category:
    return CATEGORIES.get(category_id)


def all_categories() -> list[Category]:
    return CATEGORIES.all()


def remove(category_id: int) -> None:
    CATEGORIES.delete(category_id)
