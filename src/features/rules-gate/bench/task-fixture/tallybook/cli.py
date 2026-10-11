"""The command line."""
import csv
import sys

from tallybook.money import format_cents
from tallybook.reconcile import reconcile


def report(path):
    """Print the entries of a CSV file and their total."""
    with open(path) as f:
        rows = [{"id": r["id"], "name": r["name"], "amount_cents": int(r["amount_cents"])} for r in csv.DictReader(f)]
    for row in rows:
        print(row["id"], row["name"], format_cents(row["amount_cents"]))
    print("total", format_cents(reconcile(rows).total_cents))


def main(argv=None):
    """Run a command; returns the exit status."""
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv[:1] == ["report"]:
        report(argv[1])
        return 0
    print("usage: tallybook report FILE")
    return 2
