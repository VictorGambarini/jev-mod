"""Money in ledgerline: every amount is an int number of cents (docs/adr/0003-integer-cents.md).

This module is vendored into the invoicing service as is, so its functions and their signatures
change only together with that service.
"""

from decimal import ROUND_HALF_UP, Decimal

SYMBOLS = {"NZD": "$", "AUD": "A$"}


def to_cents(amount: "str | int | Decimal") -> int:
    """Dollars (a str, int or Decimal) as cents, half up. A float is refused: it cannot hold cents exactly."""
    if isinstance(amount, float):
        raise TypeError("pass dollars as str or Decimal, not float")
    cents = Decimal(str(amount)) * 100
    return int(cents.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def round_half_up(numerator: int, denominator: int) -> int:
    """numerator / denominator rounded half away from zero, in exact integer arithmetic."""
    if denominator <= 0:
        raise ValueError("denominator must be positive")
    sign = -1 if numerator < 0 else 1
    quotient, remainder = divmod(abs(numerator), denominator)
    if 2 * remainder >= denominator:
        quotient += 1
    return sign * quotient


def allocate(total: int, weights: list[int]) -> list[int]:
    """Split total cents across weights so the parts add up to total exactly (largest remainder first)."""
    if not weights or any(w < 0 for w in weights) or sum(weights) == 0:
        raise ValueError("weights must be non-negative and not all zero")
    whole = sum(weights)
    parts = [total * w // whole for w in weights]
    order = sorted(range(len(weights)), key=lambda i: (total * weights[i]) % whole, reverse=True)
    for i in order[: total - sum(parts)]:
        parts[i] += 1
    return parts


def fmt(cents: int, currency: str = "NZD") -> str:
    """Cents for people: -$1,234.50, A$12.00."""
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    return f"{sign}{SYMBOLS.get(currency, currency + ' ')}{cents // 100:,}.{cents % 100:02d}"
