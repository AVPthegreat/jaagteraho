"""Proctorlog records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Proctorlog:
    attempt_id: int
    event: str
    at: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Proctorlog":
        if not self.event:
            raise ValidationError("event is required")
        return self

    def describe(self) -> str:
        return f"{self.event} · on {self.at.isoformat()}"
