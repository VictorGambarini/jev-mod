import datetime
import json
import pathlib

import pytest

from billing.calendar_utils import add_months

CASES = json.loads((pathlib.Path(__file__).parent / "cases.json").read_text())


@pytest.mark.parametrize("start,months,expected", CASES, ids=[f"add-{i:03d}" for i in range(len(CASES))])
def test_add_months(start, months, expected):
    got = add_months(datetime.date.fromisoformat(start), months)
    assert got.isoformat() == expected
