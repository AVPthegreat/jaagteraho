"""Medicine records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Medicine:
    name: str
    price: Decimal
    stock: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Medicine":
        if self.price < 0:
            raise ValidationError("price must not be negative")
        if self.stock < 0:
            raise ValidationError("stock must not be negative")
        if not self.name:
            raise ValidationError("name is required")
        return self

    def describe(self) -> str:
        return f"{self.name} · ₹{self.price}"
