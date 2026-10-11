---
name: incident-report
description: Write up an outage or incident as a blameless postmortem from notes or logs, with severity, UTC timeline and action items.
---

# Incident report

File: `docs/incidents/<YYYY-MM-DD>-<slug>.md`, dated by the day the incident started (UTC).

Headings, in this order:

    # Incident: <title>
    **Severity:** SEV1|SEV2|SEV3
    ## Summary
    ## Impact
    ## Timeline (UTC)
    ## Root cause
    ## Detection
    ## Action items

Rules:

- Severity by customer-facing downtime: SEV1 over 2 hours or any data loss; SEV2 over 30 minutes;
  otherwise SEV3.
- Timeline: one bullet per event, as `- HH:MMZ — event`, 24-hour, in UTC. Notes are usually in
  local time (NZ is UTC+13 from late September to early April, UTC+12 otherwise): convert every time.
- Blameless: name roles or teams in the prose, not people. People appear only as action item owners.
- Action items: a table with columns `Action | Owner | Due`, due dates as `YYYY-MM-DD`.
- Detection says when the alert fired and when it should have.
