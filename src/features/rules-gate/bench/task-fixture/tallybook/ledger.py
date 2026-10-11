"""A list of entries."""


class Ledger:
    """Entries in the order they were added."""

    def __init__(self):
        """Start empty."""
        self.entries = []

    def add_entry(self, amt, memo=""):
        """Add an entry of `amt` cents."""
        self.entries.append({"amt": amt, "memo": memo})

    def balance(self):
        """The sum of every entry, in cents."""
        return sum(e["amt"] for e in self.entries)
