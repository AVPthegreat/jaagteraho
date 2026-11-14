"""Order records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Order:
    listing_id: int
    quantity: int
    total: Decimal
    placed_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Order":
        if self.total < 0:
            raise ValidationError("total must not be negative")
        if self.quantity < 0:
            raise ValidationError("quantity must not be negative")
        return self

    def describe(self) -> str:
        return f"#{self.id} · ₹{self.total} · on {self.placed_on.isoformat()}"
