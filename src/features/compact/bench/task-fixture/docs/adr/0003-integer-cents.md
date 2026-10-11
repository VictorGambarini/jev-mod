# ADR 0003: money is integer cents

Status: accepted (2024-03-12)

## Context

Early versions stored prices as floats in dollars. Invoices were off by a cent often enough that
finance reconciled by hand every month: 0.1 + 0.2 is not 0.3, and summing fifty line items in
floating point drifts. Rounding was done in different places with different rules.

## Decision

- Every amount in ledgerline is an `int` number of cents, GST exclusive unless the name says
  `gross`.
- Division happens in integer arithmetic and is rounded exactly once, half up (away from zero),
  with `money.round_half_up(numerator, denominator)`. Never `round()`: Python's `round()` rounds
  half to even, which is not what our invoices, IRD or Xero expect.
- Dollars enter the system only through `money.to_cents`, which refuses floats.
- Splitting an amount (instalments, allocation across lines) uses `money.allocate`, so the parts
  always add back up to the whole.

## Consequences

- Rounding has one rule and one place. Reviews reject `float` in billing code.
- `money.py` is vendored into the invoicing service, so its function signatures are frozen unless
  both are changed together.
