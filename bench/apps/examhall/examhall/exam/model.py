"""Exam records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Exam:
    title: str
    duration_min: int
    starts_on: date
    fee: Decimal
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Exam":
        if self.fee < 0:
            raise ValidationError("fee must not be negative")
        if self.duration_min < 0:
            raise ValidationError("duration_min must not be negative")
        if not self.title:
            raise ValidationError("title is required")
        return self

    def describe(self) -> str:
        return f"{self.title} · ₹{self.fee} · on {self.starts_on.isoformat()}"
