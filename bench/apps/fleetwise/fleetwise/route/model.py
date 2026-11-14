"""Route records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Route:
    name: str
    km: int
    fare: Decimal
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Route":
        if self.fare < 0:
            raise ValidationError("fare must not be negative")
        if self.km < 0:
            raise ValidationError("km must not be negative")
        if not self.name:
            raise ValidationError("name is required")
        return self

    def describe(self) -> str:
        return f"{self.name} · ₹{self.fare}"
