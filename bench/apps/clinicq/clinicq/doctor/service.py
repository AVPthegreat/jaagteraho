"""Business rules for doctors."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Doctor


def create(data: dict) -> Doctor:
    doctor = Doctor(
        name=str(data["name"]).strip(),
        fee=to_money(data["fee"]),
        slots=int(data["slots"]),
    )
    return repo.save(doctor)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_doctors()
    return {
        "count": len(items),
        "total_fee": str(total(i.fee for i in items)),
        "average_fee": str(to_money(total(i.fee for i in items) / len(items))) if items else "0.00",
        "total_slots": sum(i.slots for i in items),
    }


def per_unit(doctor_id: int):
    """fee per slots, for reports."""
    item = repo.find(doctor_id)
    return to_money(item.fee / item.slots)
