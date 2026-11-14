"""Invoice records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Invoice:
    customer_id: int
    amount: Decimal
    gst_rate: float
    issued_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Invoice":
        if self.amount < 0:
            raise ValidationError("amount must not be negative")
        if not 0 <= self.gst_rate <= 100:
            raise ValidationError("gst_rate must be between 0 and 100")
        return self

    def describe(self) -> str:
        return f"#{self.id} · ₹{self.amount} · on {self.issued_on.isoformat()}"
