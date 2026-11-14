"""Refund records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Refund:
    order_id: int
    amount: Decimal
    asked_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Refund":
        if self.amount < 0:
            raise ValidationError("amount must not be negative")
        return self

    def describe(self) -> str:
        return f"#{self.id} · ₹{self.amount} · on {self.asked_on.isoformat()}"
