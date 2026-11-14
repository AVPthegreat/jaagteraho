"""Coupon records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Coupon:
    code: str
    discount_rate: float
    valid_until: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Coupon":
        if not 0 <= self.discount_rate <= 100:
            raise ValidationError("discount_rate must be between 0 and 100")
        if not self.code:
            raise ValidationError("code is required")
        return self

    def describe(self) -> str:
        return f"{self.code} · on {self.valid_until.isoformat()}"
