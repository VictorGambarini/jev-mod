import json
import pathlib

import pytest

from csvlite import parse_line

CASES = json.loads((pathlib.Path(__file__).parent / "cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("line,expected", CASES, ids=[f"line-{i:03d}" for i in range(len(CASES))])
def test_parse_line(line, expected):
    assert parse_line(line) == expected
