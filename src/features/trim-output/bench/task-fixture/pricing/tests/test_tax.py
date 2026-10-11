import json
import pathlib

import pytest

from shop.tax import tax_cents, total_cents

CASES = json.loads((pathlib.Path(__file__).parent / "cases.json").read_text())


@pytest.mark.parametrize("amount,rate,expected", CASES, ids=[f"tax-{i:03d}" for i in range(len(CASES))])
def test_tax_cents(amount, rate, expected):
    assert tax_cents(amount, rate) == expected


@pytest.mark.parametrize("amount,rate,expected", CASES[:40], ids=[f"total-{i:03d}" for i in range(40)])
def test_total_is_amount_plus_tax(amount, rate, expected):
    assert total_cents(amount, rate) == amount + expected
