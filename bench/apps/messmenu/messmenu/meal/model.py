"""Meal records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Meal:
    title: str
    price: Decimal
    served_on: date
    plates: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Meal":
        if self.price < 0:
            raise ValidationError("price must not be negative")
        if self.plates < 0:
            raise ValidationError("plates must not be negative")
        if not self.title:
            raise ValidationError("title is required")
        return self

    def describe(self) -> str:
        return f"{self.title} · ₹{self.price} · on {self.served_on.isoformat()}"
