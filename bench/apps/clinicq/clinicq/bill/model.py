"""Bill records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Bill:
    appointment_id: int
    amount: Decimal
    discount_rate: float
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Bill":
        if self.amount < 0:
            raise ValidationError("amount must not be negative")
        if not 0 <= self.discount_rate <= 100:
            raise ValidationError("discount_rate must be between 0 and 100")
        return self

    def describe(self) -> str:
        return f"#{self.id} · ₹{self.amount}"
