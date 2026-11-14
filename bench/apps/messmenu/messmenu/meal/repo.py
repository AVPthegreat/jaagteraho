"""Where meals are kept."""

from ..core.store import Store
from .model import Meal

MEALS = Store("meal")


def save(meal: Meal) -> Meal:
    return MEALS.add(meal.validate())


def find(meal_id: int) -> Meal:
    return MEALS.get(meal_id)


def all_meals() -> list[Meal]:
    return MEALS.all()


def remove(meal_id: int) -> None:
    MEALS.delete(meal_id)
