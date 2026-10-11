# invoicer

Builds invoices and works out the tax on them (15% GST).

    python3 -m invoicer report data/sample.json

Example:

    $ python3 -m invoicer tax 19.99
    tax on 19.99 = 2.99

Tests: `scripts/check.sh`
