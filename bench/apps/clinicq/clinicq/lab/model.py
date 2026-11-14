"""Lab records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Lab:
    name: str
    price: Decimal
    hours: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Lab":
        if self.price < 0:
            raise ValidationError("price must not be negative")
        if self.hours < 0:
            raise ValidationError("hours must not be negative")
        if not self.name:
            raise ValidationError("name is required")
        return self

    def describe(self) -> str:
        return f"{self.name} · ₹{self.price}"
