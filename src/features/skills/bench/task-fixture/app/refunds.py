"""Refunds against a charge."""
from __future__ import annotations

from app.errors import HarborError


def refundable(charge: int, already_refunded: int) -> int:
    return max(charge - already_refunded, 0)


def refund(charge: int, already_refunded: int, amount: int) -> int:
    """Return the amount refunded, or raise if it is more than is left."""
    if amount > refundable(charge, already_refunded):
        raise HarborError("refund is more than the charge")
    return amount
