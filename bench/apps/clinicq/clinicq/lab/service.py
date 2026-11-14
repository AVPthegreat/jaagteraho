"""Business rules for labs."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Lab


def create(data: dict) -> Lab:
    lab = Lab(
        name=str(data["name"]).strip(),
        price=to_money(data["price"]),
        hours=int(data["hours"]),
    )
    return repo.save(lab)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_labs()
    return {
        "count": len(items),
        "total_price": str(total(i.price for i in items)),
        "average_price": str(to_money(total(i.price for i in items) / len(items))) if items else "0.00",
        "total_hours": sum(i.hours for i in items),
    }


def per_unit(lab_id: int):
    """price per hours, for reports."""
    item = repo.find(lab_id)
    return to_money(item.price / item.hours)
