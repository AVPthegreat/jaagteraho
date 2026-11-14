"""Bus records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Bus:
    plate: str
    seats: int
    bought_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Bus":
        if self.seats < 0:
            raise ValidationError("seats must not be negative")
        if not self.plate:
            raise ValidationError("plate is required")
        return self

    def describe(self) -> str:
        return f"{self.plate} · on {self.bought_on.isoformat()}"
