"""Result records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Result:
    attempt_id: int
    marks: int
    percent: float
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Result":
        if self.marks < 0:
            raise ValidationError("marks must not be negative")
        if not 0 <= self.percent <= 100:
            raise ValidationError("percent must be between 0 and 100")
        return self

    def describe(self) -> str:
        return f"#{self.id}"
