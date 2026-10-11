"""Backfill the tax column of data/in.csv into data/out.csv. Rows with a date that does not parse are skipped."""
import csv
import datetime
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from invoicer.tax import tax

ok = skipped = 0
with open("data/in.csv") as src, open("data/out.csv", "w", newline="") as dst:
    out = csv.writer(dst)
    out.writerow(["id", "date", "amount", "tax"])
    for row in csv.DictReader(src):
        try:
            datetime.date.fromisoformat(row["date"])
        except ValueError:
            skipped += 1
            continue
        out.writerow([row["id"], row["date"], row["amount"], "%.2f" % tax(float(row["amount"]))])
        ok += 1
print("fixed %d of %d rows; %d skipped (bad dates)" % (ok, ok + skipped, skipped))
