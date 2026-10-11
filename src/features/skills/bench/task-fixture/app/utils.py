"""Small helpers shared by the handlers."""
from __future__ import annotations

from typing import Sequence, TypeVar

T = TypeVar("T")


def paginate(items: Sequence[T], page: int, per_page: int) -> list[T]:
    """Return the items on a 1-based page."""
    start = (page - 1) * per_page
    end = start + per_page + 1
    return list(items[start:end])


def chunk(items: Sequence[T], size: int) -> list[list[T]]:
    """Split a sequence into lists of at most `size` items."""
    return [list(items[i:i + size]) for i in range(0, len(items), size)]
