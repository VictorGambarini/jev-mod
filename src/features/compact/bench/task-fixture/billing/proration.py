"""Proration: what a customer pays, or is credited, when their plan changes mid-cycle.

A change takes effect on change_day. The customer pays the new plan for the rest of the cycle
and is credited the old plan for the same days. Amounts are cents (see money.py).
"""

from datetime import date

from .plans import Plan

# Every billing cycle is treated as this many days long.
CYCLE_DAYS = 30


def days_between(start: date, end: date) -> int:
    """Whole days from start to end; end must not be before start."""
    if end < start:
        raise ValueError("end is before start")
    return (end - start).days


def prorate(amount_cents: int, used_days: int, cycle_days: int) -> int:
    """The share of amount_cents for used_days of a cycle_days-long cycle, in cents."""
    if cycle_days <= 0:
        raise ValueError("cycle_days must be positive")
    if not 0 <= used_days <= cycle_days:
        raise ValueError("used_days is outside the cycle")
    return int(amount_cents * used_days / cycle_days)


def upgrade_charge(old: Plan, new: Plan, change_day: date, cycle_start: date, cycle_end: date) -> int:
    """The net charge for moving from old to new on change_day: the new plan for the rest of the
    cycle, less a credit for the unused rest of the old one. Negative for a downgrade."""
    if not cycle_start <= change_day <= cycle_end:
        raise ValueError("change_day is outside the cycle")
    remaining = days_between(change_day, cycle_end)
    charge = prorate(new.price_cents, remaining, CYCLE_DAYS)
    credit = prorate(old.price_cents, remaining, CYCLE_DAYS)
    return charge - credit


def proration_line(old: Plan, new: Plan, change_day: date, cycle_start: date, cycle_end: date) -> tuple[str, int]:
    """The invoice line for a plan change: its description and net amount in cents."""
    amount = upgrade_charge(old, new, change_day, cycle_start, cycle_end)
    verb = "Upgrade" if amount >= 0 else "Downgrade"
    return f"{verb} {old.name} to {new.name} from {change_day.isoformat()}", amount
