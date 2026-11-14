"""Customer records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Customer:
    name: str
    credit_limit: Decimal
    since: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Customer":
        if self.credit_limit < 0:
            raise ValidationError("credit_limit must not be negative")
        if not self.name:
            raise ValidationError("name is required")
        return self

    def describe(self) -> str:
        return f"{self.name} · ₹{self.credit_limit} · on {self.since.isoformat()}"
