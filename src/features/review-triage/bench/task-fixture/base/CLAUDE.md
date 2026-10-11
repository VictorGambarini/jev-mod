# kauri-shop

## Rules
- Money is always an integer number of cents. Never use float for money.
- Never swallow an exception: catch the narrowest type and log it, or let it propagate.
- Migrations must not lose data: never drop a column that holds data without a backfill migration first.
- Every admin handler is wrapped in `@require_admin`.
- SQL always uses `?` placeholders, never string formatting.
