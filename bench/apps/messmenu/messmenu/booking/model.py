"""Booking records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Booking:
    student: str
    meal_id: int
    plates: int
    booked_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Booking":
        if self.plates < 0:
            raise ValidationError("plates must not be negative")
        if not self.student:
            raise ValidationError("student is required")
        return self

    def describe(self) -> str:
        return f"{self.student} · on {self.booked_on.isoformat()}"
