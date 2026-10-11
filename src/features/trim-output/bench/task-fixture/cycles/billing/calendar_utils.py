"""Calendar helpers for billing cycles."""
import datetime

DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def add_months(day, months):
    """The same day number `months` later, or the last day of that month if it has fewer days."""
    index = day.year * 12 + (day.month - 1) + months
    year, month = divmod(index, 12)
    month += 1
    last = DAYS_IN_MONTH[month - 1]
    return datetime.date(year, month, min(day.day, last))
