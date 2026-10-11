"""Dunning: retrying a failed payment, then suspending. The schedule is in config/billing.json."""

import json
from datetime import datetime, timedelta
from pathlib import Path

CONFIG = Path(__file__).resolve().parent.parent / "config" / "billing.json"


def schedule() -> tuple[list[int], int]:
    """The retry days after a failure, and the day the subscription is suspended."""
    d = json.loads(CONFIG.read_text())["dunning"]
    return list(d["retry_days"]), int(d["suspend_after_days"])


def next_retry(failed_at: datetime, attempts: int) -> datetime | None:
    """When to retry after attempts retries already made, or None when retries are used up."""
    days, _ = schedule()
    if attempts >= len(days):
        return None
    return failed_at + timedelta(days=days[attempts])


def suspend_at(failed_at: datetime) -> datetime:
    """When an unpaid subscription is suspended."""
    _, after = schedule()
    return failed_at + timedelta(days=after)
