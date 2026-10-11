import json
import pathlib

import pytest

from slugger import slugify

CASES = json.loads((pathlib.Path(__file__).parent / "cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("title,expected", CASES, ids=[f"title-{i:03d}" for i in range(len(CASES))])
def test_slugify(title, expected):
    assert slugify(title) == expected
