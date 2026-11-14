"""Appointment records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Appointment:
    patient_id: int
    doctor_id: int
    on: date
    token: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Appointment":
        if self.token < 0:
            raise ValidationError("token must not be negative")
        return self

    def describe(self) -> str:
        return f"#{self.id} · on {self.on.isoformat()}"
