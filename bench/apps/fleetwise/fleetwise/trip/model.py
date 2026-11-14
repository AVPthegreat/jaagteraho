"""Trip records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Trip:
    bus_id: int
    route_id: int
    riders: int
    ran_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Trip":
        if self.riders < 0:
            raise ValidationError("riders must not be negative")
        return self

    def describe(self) -> str:
        return f"#{self.id} · on {self.ran_on.isoformat()}"
