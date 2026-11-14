"""Driver records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Driver:
    name: str
    licence_until: date
    trips: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Driver":
        if self.trips < 0:
            raise ValidationError("trips must not be negative")
        if not self.name:
            raise ValidationError("name is required")
        return self

    def describe(self) -> str:
        return f"{self.name} · on {self.licence_until.isoformat()}"
