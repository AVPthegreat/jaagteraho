"""Business rules for bookings."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..meal import repo as meal_repo
from . import repo
from .model import Booking


def create(data: dict) -> Booking:
    booking = Booking(
        student=str(data["student"]).strip(),
        meal_id=int(data["meal_id"]),
        plates=int(data["plates"]),
        booked_on=parse_date(data["booked_on"]),
    )
    meal_repo.find(booking.meal_id)
    return repo.save(booking)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_bookings()
    return {
        "count": len(items),
        "total_plates": sum(i.plates for i in items),
        "latest_booked_on": max((i.booked_on for i in items), default=None),
    }


def overdue(bookings: list | None = None, today=None) -> list:
    """Bookings whose booked_on is in the past."""
    items = bookings if bookings is not None else repo.all_bookings()
    return [i for i in items if is_past(i.booked_on, today)]
