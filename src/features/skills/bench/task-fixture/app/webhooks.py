"""Delivery of events to partner endpoints."""
from __future__ import annotations

RETRY_LIMIT = 3
BACKOFF_SECONDS = (5, 30, 120)


def should_retry(attempt: int) -> bool:
    return attempt < RETRY_LIMIT
