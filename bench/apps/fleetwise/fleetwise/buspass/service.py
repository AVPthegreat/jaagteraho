"""Business rules for buspasses."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..route import repo as route_repo
from . import repo
from .model import Buspass


def create(data: dict) -> Buspass:
    buspass = Buspass(
        student=str(data["student"]).strip(),
        route_id=int(data["route_id"]),
        price=to_money(data["price"]),
        valid_until=parse_date(data["valid_until"]),
    )
    route_repo.find(buspass.route_id)
    return repo.save(buspass)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_buspasses()
    return {
        "count": len(items),
        "total_price": str(total(i.price for i in items)),
        "average_price": str(to_money(total(i.price for i in items) / len(items))) if items else "0.00",
        "latest_valid_until": max((i.valid_until for i in items), default=None),
    }


def overdue(buspasses: list | None = None, today=None) -> list:
    """Buspasses whose valid_until is in the past."""
    items = buspasses if buspasses is not None else repo.all_buspasses()
    return [i for i in items if is_past(i.valid_until, today)]
