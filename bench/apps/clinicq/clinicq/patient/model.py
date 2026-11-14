"""Patient records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Patient:
    name: str
    age: int
    joined_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Patient":
        if self.age < 0:
            raise ValidationError("age must not be negative")
        if not self.name:
            raise ValidationError("name is required")
        return self

    def describe(self) -> str:
        return f"{self.name} · on {self.joined_on.isoformat()}"
