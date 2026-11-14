"""Buspass records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Buspass:
    student: str
    route_id: int
    price: Decimal
    valid_until: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Buspass":
        if self.price < 0:
            raise ValidationError("price must not be negative")
        if not self.student:
            raise ValidationError("student is required")
        return self

    def describe(self) -> str:
        return f"{self.student} · ₹{self.price} · on {self.valid_until.isoformat()}"
