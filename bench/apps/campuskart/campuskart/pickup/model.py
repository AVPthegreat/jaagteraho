"""Pickup records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Pickup:
    order_id: int
    spot: str
    at: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Pickup":
        if not self.spot:
            raise ValidationError("spot is required")
        return self

    def describe(self) -> str:
        return f"{self.spot} · on {self.at.isoformat()}"
