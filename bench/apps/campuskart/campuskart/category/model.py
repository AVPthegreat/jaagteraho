"""Category records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Category:
    name: str
    items: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Category":
        if self.items < 0:
            raise ValidationError("items must not be negative")
        if not self.name:
            raise ValidationError("name is required")
        return self

    def describe(self) -> str:
        return f"{self.name}"
