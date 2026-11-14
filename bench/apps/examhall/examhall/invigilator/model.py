"""Invigilator records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Invigilator:
    name: str
    exams: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Invigilator":
        if self.exams < 0:
            raise ValidationError("exams must not be negative")
        if not self.name:
            raise ValidationError("name is required")
        return self

    def describe(self) -> str:
        return f"{self.name}"
