"""Attempt records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Attempt:
    exam_id: int
    student_id: int
    started_on: date
    answered: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Attempt":
        if self.answered < 0:
            raise ValidationError("answered must not be negative")
        return self

    def describe(self) -> str:
        return f"#{self.id} · on {self.started_on.isoformat()}"
