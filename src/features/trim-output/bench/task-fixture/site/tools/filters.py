"""Template filters."""


def upper(value):
    return str(value).upper()


def money(value):
    return f"${int(value) / 100:,.2f}"


def date(value):
    return str(value)[:10]


def truncate(value):
    return str(value)[:80]
