"""Orders and their totals."""
from __future__ import annotations

from dataclasses import dataclass, field

from app.money import parse_amount


@dataclass
class Line:
    sku: str
    unit_price: int
    quantity: int = 1


@dataclass
class Order:
    id: str
    lines: list[Line] = field(default_factory=list)

    def total(self) -> int:
        return sum(line.unit_price * line.quantity for line in self.lines)


def line_from_row(sku: str, price_text: str, quantity: int = 1) -> Line:
    """Build a line from a spreadsheet row where the price is text."""
    return Line(sku, parse_amount(price_text), quantity)
