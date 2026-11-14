"""Listing records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Listing:
    seller_id: int
    title: str
    price: Decimal
    listed_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Listing":
        if self.price < 0:
            raise ValidationError("price must not be negative")
        if not self.title:
            raise ValidationError("title is required")
        return self

    def describe(self) -> str:
        return f"{self.title} · ₹{self.price} · on {self.listed_on.isoformat()}"
