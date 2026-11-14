"""Chat records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Chat:
    listing_id: int
    messages: int
    started_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Chat":
        if self.messages < 0:
            raise ValidationError("messages must not be negative")
        return self

    def describe(self) -> str:
        return f"#{self.id} · on {self.started_on.isoformat()}"
