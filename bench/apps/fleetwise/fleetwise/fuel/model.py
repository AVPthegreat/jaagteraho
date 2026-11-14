"""Fuel records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Fuel:
    bus_id: int
    litres: int
    cost: Decimal
    filled_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Fuel":
        if self.cost < 0:
            raise ValidationError("cost must not be negative")
        if self.litres < 0:
            raise ValidationError("litres must not be negative")
        return self

    def describe(self) -> str:
        return f"#{self.id} · ₹{self.cost} · on {self.filled_on.isoformat()}"
