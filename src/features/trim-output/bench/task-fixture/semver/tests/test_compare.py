import json
import pathlib

import pytest

from vercmp import compare

CASES = json.loads((pathlib.Path(__file__).parent / "cases.json").read_text())


@pytest.mark.parametrize("a,b,expected", CASES, ids=[f"cmp-{i:03d}" for i in range(len(CASES))])
def test_compare(a, b, expected):
    assert compare(a, b) == expected


@pytest.mark.parametrize("a,b,expected", CASES[:60], ids=[f"swap-{i:03d}" for i in range(60)])
def test_compare_is_antisymmetric(a, b, expected):
    assert compare(b, a) == -expected
