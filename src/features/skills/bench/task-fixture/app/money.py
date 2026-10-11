"""Money helpers. Amounts are integer cents."""
from __future__ import annotations


def parse_amount(text: str) -> int:
    """Parse '12.50' or '$12.50' into 1250 cents."""
    clean = text.strip().lstrip("$").replace(",", "")
    whole, _, frac = clean.partition(".")
    return int(whole or 0) * 100 + int((frac + "00")[:2])


def format_amount(cents: int) -> str:
    """Format 1250 cents as '$12.50'."""
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    return f"{sign}${cents // 100}.{cents % 100:02d}"


def split_evenly(total: int, parts: int) -> list[int]:
    """Split cents into parts, the first ones taking the remainder."""
    base, extra = divmod(total, parts)
    return [base + (1 if i < extra else 0) for i in range(parts)]
