#!/usr/bin/env python3
"""Count requests in logs/ for one New Zealand business day (UTC+13), by unique rid, last attempt."""
import argparse
import datetime as dt
import glob
import os
import re

ap = argparse.ArgumentParser()
ap.add_argument("--day", required=True)
ap.add_argument("--prefix", default="/")
ap.add_argument("--failed", action="store_true")
a = ap.parse_args()
day = dt.datetime.strptime(a.day, "%Y-%m-%d")
lo = day - dt.timedelta(hours=13)
hi = lo + dt.timedelta(days=1)
last = {}
for path in sorted(glob.glob(os.path.join("logs", "app-*.log"))):
    for line in open(path):
        m = re.match(r"(\S+)Z .*rid=(\w+) .*path=(\S+) status=(\d+) attempt=(\d+)", line)
        if not m:
            continue
        t = dt.datetime.strptime(m.group(1), "%Y-%m-%dT%H:%M:%S")
        p = m.group(3)
        if not (lo <= t < hi) or p == "/healthz" or not p.startswith(a.prefix):
            continue
        rid, status, attempt = m.group(2), int(m.group(4)), int(m.group(5))
        if rid not in last or attempt >= last[rid][0]:
            last[rid] = (attempt, status)
n = sum(1 for _, s in last.values() if s >= 500) if a.failed else len(last)
print(f"{n} {'failed ' if a.failed else ''}requests under {a.prefix} on {a.day} (NZ)")
