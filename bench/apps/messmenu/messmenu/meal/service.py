"""Business rules for meals."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Meal


def create(data: dict) -> Meal:
    meal = Meal(
        title=str(data["title"]).strip(),
        price=to_money(data["price"]),
        served_on=parse_date(data["served_on"]),
        plates=int(data["plates"]),
    )
    return repo.save(meal)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_meals()
    return {
        "count": len(items),
        "total_price": str(total(i.price for i in items)),
        "average_price": str(to_money(total(i.price for i in items) / len(items))) if items else "0.00",
        "total_plates": sum(i.plates for i in items),
        "latest_served_on": max((i.served_on for i in items), default=None),
    }


def overdue(meals: list | None = None, today=None) -> list:
    """Meals whose served_on is in the past."""
    items = meals if meals is not None else repo.all_meals()
    return [i for i in items if is_past(i.served_on, today)]


def per_unit(meal_id: int):
    """price per plates, for reports."""
    item = repo.find(meal_id)
    return to_money(item.price / item.plates)
