---
name: db-migration
description: Create a database migration (schema change) in migrations/ with the right numbering, header, rollback file and locking rules.
---

# Database migration

Files go in `migrations/`, two per change, numbered one above the highest existing number:

    NNNN_<verb>_<object>.sql        the change
    NNNN_<verb>_<object>.down.sql   its exact reverse

Every up file starts with a header line `-- risk: low|medium|high`.

Large tables (`orders`, `events`, `ledger_entries`, each over 1M rows) must not lock writes:

- Every ALTER on them ends with `ALGORITHM=INPLACE, LOCK=NONE`.
- New columns on them are nullable and have no DEFAULT. Backfill in a separate step.
- Their risk is at least `medium`.

Other tables: plain ALTER, risk `low`. Never edit a migration that has been merged.
