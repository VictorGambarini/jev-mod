"""Small helpers."""


def fmt_money(cents):
    """12345 -> '$123.45'."""
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    return f"{sign}${cents // 100:,}.{cents % 100:02d}"


def chunks(items, size):
    """Yield lists of at most `size` items."""
    for i in range(0, len(items), size):
        yield items[i:i + size]
