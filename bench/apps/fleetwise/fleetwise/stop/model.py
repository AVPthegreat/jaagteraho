"""Stop records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Stop:
    name: str
    route_id: int
    order: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Stop":
        if self.order < 0:
            raise ValidationError("order must not be negative")
        if not self.name:
            raise ValidationError("name is required")
        return self

    def describe(self) -> str:
        return f"{self.name}"
