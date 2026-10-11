"""Amounts are integer cents."""


def add(a, b):
    """Add two amounts."""
    return a + b


def format_cents(cents):
    """Show cents as dollars, e.g. 1050 -> '10.50'."""
    sign = "-" if cents < 0 else ""
    whole, rest = divmod(abs(cents), 100)
    return "%s%d.%02d" % (sign, whole, rest)
