"""Question records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Question:
    exam_id: int
    text: str
    marks: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Question":
        if self.marks < 0:
            raise ValidationError("marks must not be negative")
        if not self.text:
            raise ValidationError("text is required")
        return self

    def describe(self) -> str:
        return f"{self.text}"
