# ledgerline

Billing for Tidewater's subscription products (customers in NZ and AU): plans, proration,
invoices and GST, coupons, dunning, CSV export for finance, and webhooks to partners.

- Python 3.11+, standard library only. Ask before adding a dependency.
- Money is an int number of cents everywhere (docs/adr/0003-integer-cents.md). Use the helpers in
  billing/money.py; never floats for money.
- The full check is `scripts/check.sh` (compiles every module, then runs the whole unittest suite).
- One test file per module in tests/, plain unittest.
- Type hints and a docstring on every public function. No print() in library code.
- Do not commit or push; the person reviews the diff.
