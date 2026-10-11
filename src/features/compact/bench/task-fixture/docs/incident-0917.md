# Incident 0917: checkout errors

- Detected: 17 September, 09:42 NZST, by the payments error-rate alert.
- Resolved: 11:18 NZST (1 hour 36 minutes).
- Incident commander: Aroha Ngata. Scribe: Lukas Brandt.
- Impact: 312 checkouts failed; no double charges.

## What happened

A config push set the payments service's timeout to 600 ms instead of 6000 ms. Card
authorisations that took longer than 600 ms were cut off, and the gateway returned 502s.
The bad value came from a copy of the staging file, where the card sandbox answers fast.

## Root cause

The deploy pipeline does not diff a service's config against the last good one, so a
tenfold change to a timeout went out without review.

## Action items

1. Diff config against the last good deploy and require approval for any timeout change
   over 2x. Owner: Lukas Brandt. Due 1 October.
2. Alert on the payments 502 rate separately from the error rate. Owner: Sione Fifita.
3. Add the incident to the on-call runbook. Owner: Aroha Ngata.
