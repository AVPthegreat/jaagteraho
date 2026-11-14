"""Complaint records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Complaint:
    text: str
    trip_id: int
    filed_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Complaint":
        if not self.text:
            raise ValidationError("text is required")
        return self

    def describe(self) -> str:
        return f"{self.text} · on {self.filed_on.isoformat()}"
