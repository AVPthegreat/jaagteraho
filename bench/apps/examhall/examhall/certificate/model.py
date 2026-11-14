"""Certificate records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Certificate:
    result_id: int
    issued_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Certificate":
        return self

    def describe(self) -> str:
        return f"#{self.id} · on {self.issued_on.isoformat()}"
