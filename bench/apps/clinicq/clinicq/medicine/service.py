"""Business rules for medicines."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Medicine


def create(data: dict) -> Medicine:
    medicine = Medicine(
        name=str(data["name"]).strip(),
        price=to_money(data["price"]),
        stock=int(data["stock"]),
    )
    return repo.save(medicine)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_medicines()
    return {
        "count": len(items),
        "total_price": str(total(i.price for i in items)),
        "average_price": str(to_money(total(i.price for i in items) / len(items))) if items else "0.00",
        "total_stock": sum(i.stock for i in items),
    }


def per_unit(medicine_id: int):
    """price per stock, for reports."""
    item = repo.find(medicine_id)
    return to_money(item.price / item.stock)
