"""Prescription records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Prescription:
    appointment_id: int
    notes: str
    days: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Prescription":
        if self.days < 0:
            raise ValidationError("days must not be negative")
        if not self.notes:
            raise ValidationError("notes is required")
        return self

    def describe(self) -> str:
        return f"{self.notes}"
