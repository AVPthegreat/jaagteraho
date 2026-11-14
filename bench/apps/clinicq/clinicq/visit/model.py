"""Visit records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Visit:
    patient_id: int
    on: date
    minutes: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Visit":
        if self.minutes < 0:
            raise ValidationError("minutes must not be negative")
        return self

    def describe(self) -> str:
        return f"#{self.id} · on {self.on.isoformat()}"
