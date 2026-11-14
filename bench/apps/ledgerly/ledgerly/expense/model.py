"""Expense records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Expense:
    label: str
    amount: Decimal
    spent_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Expense":
        if self.amount < 0:
            raise ValidationError("amount must not be negative")
        if not self.label:
            raise ValidationError("label is required")
        return self

    def describe(self) -> str:
        return f"{self.label} · ₹{self.amount} · on {self.spent_on.isoformat()}"
