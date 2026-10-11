---
name: log-analysis
description: Answer questions about requests and errors from the service logs in logs/, such as how many requests failed on a day or for an endpoint.
---

# Log analysis

The logs are `logs/app-<UTC date>.log`, rotated at UTC midnight, all timestamps UTC (`Z`).
Our business day is New Zealand time (UTC+13 in October), so "8 Oct" is
2026-10-07T11:00Z up to 2026-10-08T11:00Z and spans two files.

What counts:

- A request is a unique `rid`. A request retried has several lines with rising `attempt`.
- It **failed** if its last attempt has status 500 or above. Earlier failed attempts do not count.
- `/healthz` is the load balancer probe, never a request.

Do not count lines. Run the helper, which applies all of this:

    python3 .claude/skills/log-analysis/logq.py --day 2026-10-08 --prefix /v1/orders --failed

Without `--failed` it prints all requests. `--day` is the NZ business day.
