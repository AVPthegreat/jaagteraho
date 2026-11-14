"""Where bookings are kept."""

from ..core.store import Store
from .model import Booking

BOOKINGS = Store("booking")


def save(booking: Booking) -> Booking:
    return BOOKINGS.add(booking.validate())


def find(booking_id: int) -> Booking:
    return BOOKINGS.get(booking_id)


def all_bookings() -> list[Booking]:
    return BOOKINGS.all()


def remove(booking_id: int) -> None:
    BOOKINGS.delete(booking_id)
