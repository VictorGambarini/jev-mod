"""Delivery estimates."""

from datetime import date, datetime, time, timedelta

# Bookings at or after the cutoff are picked up the next business day.
CUTOFF = time(15, 0)


def is_business_day(d: date) -> bool:
    """Monday to Friday."""
    return d.weekday() < 5


def next_business_day(d: date) -> date:
    """The first business day after d."""
    d += timedelta(days=1)
    while not is_business_day(d):
        d += timedelta(days=1)
    return d


def pickup_day(booked: datetime) -> date:
    """The day the courier picks the parcel up."""
    d = booked.date()
    if booked.time() >= CUTOFF:
        d = next_business_day(d)
    return d


def estimate_delivery(booked: datetime, service_days: int) -> date:
    """The day a parcel booked at `booked` arrives with a service of this many business days."""
    d = pickup_day(booked)
    for _ in range(service_days):
        d = next_business_day(d)
    return d
