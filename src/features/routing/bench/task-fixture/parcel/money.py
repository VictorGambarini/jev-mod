"""Money helpers. Every amount is an int number of cents."""

GST_PERCENT = 15


def round_half_up(numerator: int, denominator: int) -> int:
    """numerator / denominator rounded to the nearest int, halves away from zero."""
    if denominator <= 0:
        raise ValueError("denominator must be positive")
    sign = -1 if numerator < 0 else 1
    q, r = divmod(abs(numerator), denominator)
    if 2 * r >= denominator:
        q += 1
    return sign * q


def gst(cents: int) -> int:
    """The GST on an amount, rounded half up to the cent."""
    return round_half_up(cents * GST_PERCENT, 100)


def format_nzd(cents: int) -> str:
    """1234 -> '$12.34'."""
    sign = "-" if cents < 0 else ""
    return f"{sign}${abs(cents) // 100}.{abs(cents) % 100:02d}"
