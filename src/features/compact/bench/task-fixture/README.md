# ledgerline

Subscription billing for Tidewater. The package is `billing/`; see docs/architecture.md for how a
charge becomes an invoice, and docs/webhooks-contract.md for what partners receive.

    scripts/check.sh            # compile + the full test suite
    python3 -m unittest tests.test_invoice -v   # one module's tests

Configuration lives in config/billing.json (regions, retry schedule, partner endpoints).
