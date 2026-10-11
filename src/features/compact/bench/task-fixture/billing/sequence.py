"""Document numbers. Each sequence is a row in the `sequences` table, incremented under a row
lock, so every worker process hands out distinct numbers. SequenceStore stands in for the table
here (tests and local runs); production passes the database-backed store."""

import threading


class SequenceStore:
    """An in-memory `sequences` table: name -> last number handed out."""

    def __init__(self) -> None:
        self._last: dict[str, int] = {}
        self._lock = threading.Lock()

    def increment(self, name: str) -> int:
        """The next number for name, as one atomic step."""
        with self._lock:
            self._last[name] = self._last.get(name, 0) + 1
            return self._last[name]


DEFAULT_STORE = SequenceStore()


class Sequence:
    """Numbers like INV-000042: a prefix and a six-digit counter kept in a store."""

    def __init__(self, name: str, prefix: str, store: SequenceStore = DEFAULT_STORE) -> None:
        self.name = name
        self.prefix = prefix
        self.store = store

    def next(self) -> str:
        """The next number, formatted."""
        return f"{self.prefix}{self.store.increment(self.name):06d}"
