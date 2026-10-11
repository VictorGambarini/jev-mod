"""Matching rows against a statement."""


class Result:
    """What a reconciliation found."""

    def __init__(self, total_cents, used):
        """Keep the total and how many rows made it up."""
        self.total_cents = total_cents
        self.used = used


def reconcile(rows):
    """Sum the amount_cents of every well-formed row; malformed rows are left out."""
    total = 0
    used = 0
    for row in rows:
        cents = row.get("amount_cents")
        if not isinstance(cents, int):
            continue
        total += cents
        used += 1
    return Result(total, used)
