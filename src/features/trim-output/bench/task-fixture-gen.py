#!/usr/bin/env python3
"""Writes task-fixture/: the ten small projects trim-output's task bench works in.

    python3 task-fixture-gen.py            # rewrites task-fixture/ beside this file

Each project is a real little codebase whose test run, build or replay prints hundreds of lines
(a few of them failures, or one error) and has one bug. Everything is deterministic: the
cases are made by a fixed random seed from a correct reference, then the project is given the
bug. The checker (task.ts) runs each project's own tests or build again on a copy of the work
folder with the original tests and scripts put back, so the only way to pass is to fix the code.
"""
import json
import os
import random
import shutil
import sqlite3
import stat
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "task-fixture")


def write(path, text, exe=False):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(text)
    if exe:
        os.chmod(full, os.stat(full).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


PYMAKE = "test:\n\tpython3 -m pytest -v -p no:cacheprovider\n"


def dump(path, data):
    write(path, json.dumps(data, ensure_ascii=False, indent=0) + "\n")


# ---------------------------------------------------------------- slugify

SLUG_TABLE_FULL = {"ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "þ": "th"}

SLUG_BUGGY = '''"""Turn a title into a URL slug."""
import re
import unicodedata

# characters that do not decompose into a letter and an accent
TRANSLITERATE = {"ß": "ss", "æ": "ae", "œ": "oe", "þ": "th"}


def slugify(text, max_len=60):
    for ch, repl in TRANSLITERATE.items():
        text = text.replace(ch, repl).replace(ch.upper(), repl.upper())
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    if len(text) > max_len:
        text = text[:max_len].rsplit("-", 1)[0]
    return text
'''


def slug_reference(text, max_len=60):
    import re
    import unicodedata
    for ch, repl in SLUG_TABLE_FULL.items():
        text = text.replace(ch, repl).replace(ch.upper(), repl.upper())
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    if len(text) > max_len:
        text = text[:max_len].rsplit("-", 1)[0]
    return text


def make_slugify():
    rnd = random.Random(11)
    words = ("Café crème brûlée Über Straße Señor niño naïve façade Zoë Åland Smörgåsbord résumé coöperate "
             "Dvořák Čapek Šiška piñata jalapeño déjà vu Köln München Zürich São Paulo Málaga Ürümqi "
             "release notes guide setup quick start intro basics advanced tips tricks faq changelog roadmap "
             "billing invoices reports export import archive search filters labels teams roles").split()
    titles = []
    while len(titles) < 400:
        n = rnd.randint(2, 6)
        titles.append(" ".join(rnd.choice(words) for _ in range(n)) + rnd.choice(["", "", "!", " (2026)", " - draft"]))
    # three titles with letters that are not accents on a base letter
    for at, title in ((97, "Łódź city guide: Półwysep getting started"), (211, "Đà Nẵng travel notes"),
                      (338, "Søren Kierkegaard reading list")):
        titles[at] = title
    cases = [[t, slug_reference(t)] for t in titles]
    dump("slugify/tests/cases.json", cases)
    write("slugify/slugger/__init__.py", "from .slug import slugify\n")
    write("slugify/slugger/slug.py", SLUG_BUGGY)
    write("slugify/tests/test_slug.py", '''import json
import pathlib

import pytest

from slugger import slugify

CASES = json.loads((pathlib.Path(__file__).parent / "cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("title,expected", CASES, ids=[f"title-{i:03d}" for i in range(len(CASES))])
def test_slugify(title, expected):
    assert slugify(title) == expected
''')
    write("slugify/Makefile", PYMAKE)
    write("slugify/README.md", "# slugger\n\nTurns page titles into URL slugs. Run the tests with `make test`.\n")


# ---------------------------------------------------------------- tax rounding

TAX_BUGGY = '''"""Tax on a price in integer cents. Rates are in basis points (1500 = 15%)."""


def tax_cents(amount_cents, rate_bp):
    """Tax on amount_cents, rounded to the nearest cent, halves away from zero.

    Refunds are negative amounts and must round the same way as charges: -5 cents of tax
    is -5, not -4.
    """
    return (amount_cents * rate_bp + 5000) // 10000


def total_cents(amount_cents, rate_bp):
    return amount_cents + tax_cents(amount_cents, rate_bp)
'''


def tax_reference(a, r):
    x = a * r
    q, rem = divmod(abs(x), 10000)
    if rem >= 5000:
        q += 1
    return q if x >= 0 else -q


def make_tax():
    rnd = random.Random(23)
    cases = []
    rates = [1500, 1000, 825, 1900, 2000, 500, 700]
    while len(cases) < 340:
        a = rnd.randint(-40000, 90000)
        r = rnd.choice(rates)
        if a < 0 and (a * r) % 10000 == 5000:
            continue  # exact negative halves are added by hand below
        cases.append([a, r, tax_reference(a, r)])
    for a, r in ((-1000, 5), (-3000, 5), (-90, 500), (-110, 500)):
        # each is an exact half: a*r % 10000 == 5000
        assert (a * r) % 10000 == 5000 or (abs(a * r) % 10000 == 5000), (a, r)
        cases.insert(rnd.randint(0, len(cases)), [a, r, tax_reference(a, r)])
    dump("pricing/tests/cases.json", cases)
    write("pricing/shop/__init__.py", "")
    write("pricing/shop/tax.py", TAX_BUGGY)
    write("pricing/tests/test_tax.py", '''import json
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
''')
    write("pricing/Makefile", PYMAKE)
    write("pricing/README.md", "# shop pricing\n\nTax maths in integer cents. `make test` runs the tests.\n")


# ---------------------------------------------------------------- add_months

MONTHS_BUGGY = '''"""Calendar helpers for billing cycles."""
import datetime

DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def add_months(day, months):
    """The same day number `months` later, or the last day of that month if it has fewer days."""
    index = day.year * 12 + (day.month - 1) + months
    year, month = divmod(index, 12)
    month += 1
    last = DAYS_IN_MONTH[month - 1]
    return datetime.date(year, month, min(day.day, last))
'''


def add_months_reference(day, months):
    import calendar
    import datetime
    index = day.year * 12 + (day.month - 1) + months
    year, month = divmod(index, 12)
    month += 1
    return datetime.date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def make_months():
    import datetime
    rnd = random.Random(31)
    cases = []
    while len(cases) < 480:
        d = datetime.date(rnd.randint(2019, 2031), rnd.randint(1, 12), rnd.randint(1, 28))
        n = rnd.choice([1, 1, 1, 2, 3, 6, 12, -1, -3, 24])
        cases.append([d.isoformat(), n, add_months_reference(d, n).isoformat()])
    # month ends that land in a leap February: the table's 28 is wrong there
    for k, (d, n) in enumerate((("2024-01-31", 1), ("2027-12-30", 2), ("2028-03-31", -1))):
        cases[40 + k * 170] = [d, n, add_months_reference(datetime.date.fromisoformat(d), n).isoformat()]
    dump("cycles/tests/cases.json", cases)
    write("cycles/billing/__init__.py", "")
    write("cycles/billing/calendar_utils.py", MONTHS_BUGGY)
    write("cycles/tests/test_calendar_utils.py", '''import datetime
import json
import pathlib

import pytest

from billing.calendar_utils import add_months

CASES = json.loads((pathlib.Path(__file__).parent / "cases.json").read_text())


@pytest.mark.parametrize("start,months,expected", CASES, ids=[f"add-{i:03d}" for i in range(len(CASES))])
def test_add_months(start, months, expected):
    got = add_months(datetime.date.fromisoformat(start), months)
    assert got.isoformat() == expected
''')
    write("cycles/Makefile", PYMAKE)
    write("cycles/README.md", "# billing cycles\n\nCalendar helpers. `make test` runs the tests.\n")


# ---------------------------------------------------------------- csv parsing

CSV_BUGGY = '''"""A small CSV line parser: commas, quoted fields, and "" for a quote inside a quoted field."""


def parse_line(line):
    fields = []
    field = []
    quoted = False
    for ch in line:
        if quoted:
            if ch == '"':
                quoted = False
            else:
                field.append(ch)
        elif ch == '"':
            quoted = True
        elif ch == ",":
            fields.append("".join(field))
            field = []
        else:
            field.append(ch)
    fields.append("".join(field))
    return fields
'''


def make_csv():
    rnd = random.Random(47)
    names = ["Ana Folau", "Hemi Walker", "Kiri Wairua", "Tomasz Nowak", "Mereana Tait", "Rawiri Ngata", "Priya Shah", "Lee Chen"]
    notes = ["paid in full", "net 30", "call before delivery", "VIP", "see invoice", "late fee waived", "partial refund"]
    cases = []
    for _ in range(300):
        n = rnd.choice(names)
        note = rnd.choice(notes)
        amount = str(rnd.randint(10, 9999))
        if rnd.random() < 0.25:
            cases.append([f'{n},"{note}, urgent",{amount}', [n, f"{note}, urgent", amount]])
        else:
            cases.append([f"{n},{note},{amount}", [n, note, amount]])
    # three lines with an escaped quote inside a quoted field
    for at, (n, note) in ((60, ("Ana Folau", 'said "call me"')), (140, ("Priya Shah", 'size 5" pipe')), (230, ("Lee Chen", 'the "big" order, rush'))):
        cases[at] = [f'{n},"{note.replace(chr(34), chr(34) * 2)}",120', [n, note, "120"]]
    dump("csvparse/tests/cases.json", cases)
    write("csvparse/csvlite/__init__.py", "from .parser import parse_line\n")
    write("csvparse/csvlite/parser.py", CSV_BUGGY)
    write("csvparse/tests/test_parser.py", '''import json
import pathlib

import pytest

from csvlite import parse_line

CASES = json.loads((pathlib.Path(__file__).parent / "cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("line,expected", CASES, ids=[f"line-{i:03d}" for i in range(len(CASES))])
def test_parse_line(line, expected):
    assert parse_line(line) == expected
''')
    write("csvparse/Makefile", PYMAKE)
    write("csvparse/README.md", "# csvlite\n\nParses one CSV line. `make test` runs the tests.\n")


# ---------------------------------------------------------------- semver

SEMVER_BUGGY = '''"""Compare version strings the way semver.org says: 1.0.0-alpha.2 < 1.0.0-alpha.10 < 1.0.0."""
import re

_PATTERN = re.compile(r"^(\\d+)\\.(\\d+)\\.(\\d+)(?:-([0-9A-Za-z.-]+))?(?:\\+[0-9A-Za-z.-]+)?$")


def parse(version):
    m = _PATTERN.match(version)
    if not m:
        raise ValueError(f"not a version: {version!r}")
    major, minor, patch, pre = m.groups()
    return int(major), int(minor), int(patch), pre.split(".") if pre else []


def compare(a, b):
    """-1, 0 or 1."""
    ma, mb = parse(a), parse(b)
    if ma[:3] != mb[:3]:
        return -1 if ma[:3] < mb[:3] else 1
    pa, pb = ma[3], mb[3]
    if not pa and not pb:
        return 0
    if not pa:
        return 1
    if not pb:
        return -1
    for x, y in zip(pa, pb):
        if x != y:
            return -1 if x < y else 1
    return (len(pa) > len(pb)) - (len(pa) < len(pb))
'''


def semver_reference(a, b):
    import re
    pat = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$")

    def parse(v):
        m = pat.match(v)
        M, mi, p, pre = m.groups()
        return (int(M), int(mi), int(p)), pre.split(".") if pre else []
    (ca, pa), (cb, pb) = parse(a), parse(b)
    if ca != cb:
        return -1 if ca < cb else 1
    if not pa and not pb:
        return 0
    if not pa:
        return 1
    if not pb:
        return -1
    for x, y in zip(pa, pb):
        if x == y:
            continue
        xn, yn = x.isdigit(), y.isdigit()
        if xn and yn:
            return -1 if int(x) < int(y) else 1
        if xn:
            return -1
        if yn:
            return 1
        return -1 if x < y else 1
    return (len(pa) > len(pb)) - (len(pa) < len(pb))


def make_semver():
    rnd = random.Random(59)
    pres = ["", "", "", "-alpha", "-beta", "-rc.1", "-rc.2", "-alpha.1", "-beta.2", "-alpha.beta", "-x.7.z"]

    def version():
        return f"{rnd.randint(0, 3)}.{rnd.randint(0, 4)}.{rnd.randint(0, 5)}{rnd.choice(pres)}"
    cases = []
    while len(cases) < 440:
        a, b = version(), version()
        cases.append([a, b, semver_reference(a, b)])
    # numeric identifiers of different lengths compare as numbers, not text
    for at, (a, b) in ((70, ("1.0.0-alpha.2", "1.0.0-alpha.10")), (200, ("2.1.0-rc.9", "2.1.0-rc.11")), (310, ("1.4.2-beta.100", "1.4.2-beta.20"))):
        cases[at] = [a, b, semver_reference(a, b)]
    dump("semver/tests/cases.json", cases)
    write("semver/vercmp/__init__.py", "from .compare import compare, parse\n")
    write("semver/vercmp/compare.py", SEMVER_BUGGY)
    write("semver/tests/test_compare.py", '''import json
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
''')
    write("semver/Makefile", PYMAKE)
    write("semver/README.md", "# vercmp\n\nSemantic version comparison. `make test` runs the tests.\n")


# ---------------------------------------------------------------- go: sizes

GO_BUGGY = '''// Package sizes parses human sizes such as "1.5GiB" into bytes.
package sizes

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

var units = map[string]float64{
	"B":   1,
	"KB":  1e3,
	"MB":  1e6,
	"GB":  1e9,
	"TB":  1e12,
	"PB":  1e15,
	"KIB": 1 << 10,
	"MIB": 1 << 20,
	"GIB": 1 << 30,
	"TIB": 1 << 40,
	"PIB": 1 << 40,
}

// Parse returns the number of bytes in s, rounded to the nearest byte.
func Parse(s string) (int64, error) {
	s = strings.TrimSpace(s)
	i := 0
	for i < len(s) && (unicode.IsDigit(rune(s[i])) || s[i] == '.') {
		i++
	}
	if i == 0 {
		return 0, fmt.Errorf("sizes: no number in %q", s)
	}
	n, err := strconv.ParseFloat(s[:i], 64)
	if err != nil {
		return 0, err
	}
	unit := strings.ToUpper(strings.TrimSpace(s[i:]))
	if unit == "" {
		unit = "B"
	}
	mult, ok := units[unit]
	if !ok {
		return 0, fmt.Errorf("sizes: unknown unit %q", unit)
	}
	return int64(n*mult + 0.5), nil
}
'''


def make_go():
    rnd = random.Random(71)
    ref = {"B": 1, "KB": 10**3, "MB": 10**6, "GB": 10**9, "TB": 10**12, "PB": 10**15,
           "KIB": 1 << 10, "MIB": 1 << 20, "GIB": 1 << 30, "TIB": 1 << 40, "PIB": 1 << 50}
    spell = {"KIB": "KiB", "MIB": "MiB", "GIB": "GiB", "TIB": "TiB", "PIB": "PiB"}
    rows = []
    names = [u for u in ref if u != "PIB"]
    while len(rows) < 280:
        u = rnd.choice(names)
        q = rnd.choice([1, 2, 3, 4, 5, 8, 10, 16, 64, 100, 128, 250, 512, 1024])
        frac = rnd.choice(["", "", ".5", ".25"])
        label = spell.get(u, u)
        text = f"{q}{frac}{rnd.choice(['', ' '])}{label if rnd.random() < 0.7 else label.lower()}"
        value = int(float(f"{q}{frac}") * ref[u] + 0.5)
        rows.append((text, value))
    for at, text in ((55, "1PiB"), (140, "2.5 PiB"), (222, "3pib")):
        n = float(text.lower().replace("pib", "").strip())
        rows[at] = (text, int(n * (1 << 50) + 0.5))
    body = "".join(f'\t\t{{"{t}", {v}}},\n' for t, v in rows)
    write("sizes/go.mod", "module example.com/sizes\n\ngo 1.21\n")
    write("sizes/sizes.go", GO_BUGGY)
    write("sizes/sizes_test.go", '''package sizes

import (
	"fmt"
	"testing"
)

func TestParse(t *testing.T) {
	cases := []struct {
		in   string
		want int64
	}{
''' + body + '''	}
	for i, c := range cases {
		c := c
		t.Run(fmt.Sprintf("case-%03d", i), func(t *testing.T) {
			got, err := Parse(c.in)
			if err != nil {
				t.Fatalf("Parse(%q): %v", c.in, err)
			}
			if got != c.want {
				t.Errorf("Parse(%q) = %d, want %d", c.in, got, c.want)
			}
		})
	}
}

func TestParseErrors(t *testing.T) {
	for _, in := range []string{"", "KB", "12 parsecs"} {
		if _, err := Parse(in); err == nil {
			t.Errorf("Parse(%q): want an error", in)
		}
	}
}
''')
    write("sizes/Makefile", "test:\n\tgo test -v ./...\n")
    write("sizes/README.md", "# sizes\n\nParses sizes like `1.5GiB`. `make test` runs the tests.\n")


# ---------------------------------------------------------------- node: LRU

LRU_BUGGY = '''// A small LRU cache: get() and set() both make a key the most recently used.
class LRU {
  constructor(capacity) {
    this.capacity = capacity
    this.map = new Map()
  }

  get(key) {
    const value = this.map.get(key)
    if (value) {
      // refresh: move the key to the end
      this.map.delete(key)
      this.map.set(key, value)
    }
    return value
  }

  set(key, value) {
    this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.capacity) {
      this.map.delete(this.map.keys().next().value)
    }
    return this
  }

  has(key) {
    return this.map.has(key)
  }

  get size() {
    return this.map.size
  }
}

module.exports = { LRU }
'''


def make_node():
    rnd = random.Random(83)
    values = [1, 2, 3, "a", "b", "x", 42, 7, "hello", True]
    falsy = [0, "", False]
    scenarios = []
    for i in range(260):
        cap = rnd.randint(2, 5)
        ops = []
        for _ in range(rnd.randint(6, 12)):
            k = rnd.choice("abcdefg")
            if rnd.random() < 0.55:
                ops.append(["set", k, rnd.choice(values)])
            else:
                ops.append(["get", k])
        scenarios.append({"cap": cap, "ops": ops})
    # three scenarios where a falsy value is read before the cache fills
    scenarios[44] = {"cap": 2, "ops": [["set", "a", 0], ["set", "b", 1], ["get", "a"], ["set", "c", 2], ["get", "a"]]}
    scenarios[130] = {"cap": 2, "ops": [["set", "k", ""], ["set", "m", "x"], ["get", "k"], ["set", "n", "y"], ["get", "k"]]}
    scenarios[201] = {"cap": 3, "ops": [["set", "p", False], ["set", "q", 1], ["set", "r", 2], ["get", "p"], ["set", "s", 3], ["get", "p"]]}

    def run(sc):
        from collections import OrderedDict
        d = OrderedDict()
        out = []
        for op in sc["ops"]:
            if op[0] == "set":
                d.pop(op[1], None)
                d[op[1]] = op[2]
                if len(d) > sc["cap"]:
                    d.popitem(last=False)
            else:
                if op[1] in d:
                    d.move_to_end(op[1])
                    out.append(d[op[1]])
                else:
                    out.append(None)
        return out
    cases = [{"cap": s["cap"], "ops": s["ops"], "reads": run(s)} for s in scenarios]
    dump("lru/test/cases.json", cases)
    write("lru/package.json", json.dumps({"name": "tiny-lru", "version": "1.0.0", "private": True, "scripts": {"test": "node --test"}}, indent=2) + "\n")
    write("lru/src/lru.js", LRU_BUGGY)
    write("lru/test/lru.test.js", '''const test = require('node:test')
const assert = require('node:assert')
const { LRU } = require('../src/lru')
const cases = require('./cases.json')

cases.forEach((c, i) => {
  test(`scenario ${String(i).padStart(3, '0')}: capacity ${c.cap}, ${c.ops.length} operations`, () => {
    const cache = new LRU(c.cap)
    const reads = []
    for (const [op, key, value] of c.ops) {
      if (op === 'set') cache.set(key, value)
      else reads.push(cache.has(key) ? cache.get(key) : null)
    }
    assert.deepStrictEqual(reads, c.reads)
  })
})
''')
    write("lru/README.md", "# tiny-lru\n\nAn LRU cache. `npm test` runs the tests (node's test runner).\n")


# ---------------------------------------------------------------- build

BUILD_SH = '''#!/bin/sh
# Builds the site: compiles every asset and template into dist/.
set -e
cd "$(dirname "$0")"
rm -rf dist
python3 tools/build.py
echo "build finished"
'''

BUILD_PY = '''"""The site build: copies assets into dist/ and compiles templates against filters.py."""
import os
import re
import sys

import filters

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILTER = re.compile(r"\\{\\{\\s*[\\w.]+\\s*\\|\\s*(\\w+)\\s*\\}\\}")


def log(text):
    print(text)


def build_assets():
    count = 0
    for folder, _, names in sorted(os.walk(os.path.join(ROOT, "assets"))):
        for name in sorted(names):
            src = os.path.join(folder, name)
            rel = os.path.relpath(src, ROOT)
            out = os.path.join(ROOT, "dist", rel)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            log(f"[asset] {rel}")
            log(f"  read    {os.path.getsize(src)} bytes")
            with open(src, "rb") as fin, open(out, "wb") as fout:
                fout.write(fin.read())
            log(f"  wrote   dist/{rel}")
            count += 1
    return count


def build_templates():
    count = 0
    errors = 0
    for name in sorted(os.listdir(os.path.join(ROOT, "templates"))):
        path = os.path.join(ROOT, "templates", name)
        log(f"[template] templates/{name}")
        text = open(path, encoding="utf-8").read()
        bad = False
        for lineno, line in enumerate(text.splitlines(), 1):
            for filt in FILTER.findall(line):
                if not hasattr(filters, filt):
                    log(f"error: templates/{name}:{lineno}: unknown filter {filt!r}")
                    errors += 1
                    bad = True
        if bad:
            continue
        os.makedirs(os.path.join(ROOT, "dist", "templates"), exist_ok=True)
        with open(os.path.join(ROOT, "dist", "templates", name), "w", encoding="utf-8") as f:
            f.write(text)
        log(f"  compiled templates/{name}")
        count += 1
    return count, errors


def minify_assets():
    count = 0
    for folder, _, names in sorted(os.walk(os.path.join(ROOT, "dist", "assets"))):
        for name in sorted(names):
            path = os.path.join(folder, name)
            before = os.path.getsize(path)
            log(f"[minify] {os.path.relpath(path, ROOT)}")
            log(f"  {before} -> {max(1, before * 9 // 10)} bytes")
            count += 1
    return count


def main():
    assets = build_assets()
    log(f"{assets} assets copied")
    templates, errors = build_templates()
    log(f"{templates} templates compiled")
    log(f"{minify_assets()} assets minified")
    if errors:
        log(f"build failed: {errors} error(s), see above")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
'''

FILTERS_PY = '''"""Template filters."""


def upper(value):
    return str(value).upper()


def money(value):
    return f"${int(value) / 100:,.2f}"


def date(value):
    return str(value)[:10]


def truncate(value):
    return str(value)[:80]
'''


def make_build():
    rnd = random.Random(97)
    write("site/build.sh", BUILD_SH, exe=True)
    write("site/tools/build.py", BUILD_PY)
    write("site/tools/filters.py", FILTERS_PY)
    for i in range(70):
        kind = rnd.choice(["icons", "css", "img"])
        ext = {"icons": "svg", "css": "css", "img": "png"}[kind]
        write(f"site/assets/{kind}/{kind}-{i:02d}.{ext}", f"/* {kind} {i} */\n" + "x" * rnd.randint(40, 400) + "\n")
    names = ["home", "pricing", "invoice", "receipt", "account", "login", "signup", "help", "terms", "privacy", "status", "404"]
    for n in names:
        body = f"<h1>{{{{ title | upper }}}}</h1>\n" + "<p>static text</p>\n" * 10
        if n in ("pricing", "invoice", "receipt"):
            body += "<p>Total: {{ total | money }}</p>\n"
        if n == "invoice":
            body += "<p>Issued {{ issued | date }}</p>\n" + "<p>line</p>\n" * 18 + "<p>Due: {{ due | dat }}</p>\n"
        write(f"site/templates/{n}.html", body)
    write("site/Makefile", "build:\n\t./build.sh\n")
    write("site/README.md", "# site\n\nStatic site build. `make build` (or `./build.sh`) builds into dist/.\n")


# ---------------------------------------------------------------- migrations

MIGRATE_PY = '''"""Applies db/migrations/*.sql in order. --dry-run applies them to an empty in-memory database."""
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(HERE, "db", "migrations")


def main(argv):
    dry = "--dry-run" in argv
    db = sqlite3.connect(":memory:" if dry else os.path.join(HERE, "db", "app.sqlite"))
    names = sorted(n for n in os.listdir(DIR) if n.endswith(".sql"))
    applied = 0
    failed = 0
    for name in names:
        sql = open(os.path.join(DIR, name), encoding="utf-8").read()
        print(f"{'would apply' if dry else 'apply'} {name}")
        try:
            db.executescript(sql)
        except sqlite3.Error as e:
            print(f"  error: {e}")
            failed += 1
            continue
        print(f"  ok  {sql.count(';')} statements")
        applied += 1
    if failed:
        print(f"{failed} of {len(names)} migrations failed (see above)")
        return 1
    print(f"all {applied} migrations applied cleanly")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
'''


def make_migrate():
    rnd = random.Random(101)
    tables = []
    files = []

    def add(name, sql):
        files.append((name, sql))
    n = 1
    cols = {}
    while n <= 300:
        roll = rnd.random()
        if n == 197:
            # indexes a column that migration 0199 adds: the files were numbered in the wrong order
            t = tables[3]
            add(f"{n:04d}_index_{t}_region.sql", f"CREATE INDEX idx_{n:04d}_{t}_region ON {t} (region);\n")
        elif n == 199:
            t = tables[3]
            cols[t].append("region")
            add(f"{n:04d}_add_region_to_{t}.sql", f"ALTER TABLE {t} ADD COLUMN region TEXT;\nUPDATE {t} SET region = 'nz' WHERE region IS NULL;\n")
        elif roll < 0.45 or not tables:
            t = f"t{len(tables):03d}_{rnd.choice(['orders', 'users', 'items', 'events', 'tags', 'notes'])}"
            tables.append(t)
            cols[t] = ["id"]
            add(f"{n:04d}_create_{t}.sql", f"CREATE TABLE {t} (id INTEGER PRIMARY KEY, created_at TEXT);\n")
        elif roll < 0.8:
            t = rnd.choice(tables)
            c = f"c{n}"
            cols[t].append(c)
            add(f"{n:04d}_add_{c}_to_{t}.sql", f"ALTER TABLE {t} ADD COLUMN {c} TEXT;\nUPDATE {t} SET {c} = '' WHERE {c} IS NULL;\n")
        else:
            t = rnd.choice(tables)
            c = rnd.choice(cols[t])
            add(f"{n:04d}_index_{t}_{c}.sql", f"CREATE INDEX idx_{n:04d}_{t}_{c} ON {t} ({c});\n")
        n += 1
    for name, sql in files:
        write(f"app/db/migrations/{name}", sql)
    write("app/tools/migrate.py", MIGRATE_PY)
    write("app/Makefile", "check:\n\tpython3 tools/migrate.py --dry-run\n")
    write("app/README.md", "# db\n\nMigrations live in db/migrations and apply in file-name order. `make check` runs `python3 tools/migrate.py --dry-run`, which applies them to an empty database.\n")


# ---------------------------------------------------------------- diagnosis: replay

REPLAY_PY = '''"""Replays a request trace (JSON lines) as a readable log: python3 tools/replay.py logs/trace.jsonl"""
import json
import sys


def main(path):
    for raw in open(path, encoding="utf-8"):
        e = json.loads(raw)
        extra = " ".join(f"{k}={v}" for k, v in e.items() if k not in ("t", "level", "msg"))
        print(f"{e['t']} {e['level']:<5} {e['msg']}" + (f" {extra}" if extra else ""))


if __name__ == "__main__":
    main(sys.argv[1])
'''


def make_replay():
    rnd = random.Random(113)
    tenants = [f"t-{n:04d}" for n in (12, 87, 203, 311, 417, 520, 688, 742)]
    handlers = ["list_invoices", "get_invoice", "create_invoice", "export", "search", "get_customer"]
    events = []
    clock = [0]

    def stamp():
        clock[0] += rnd.randint(1, 9)
        s = clock[0]
        return f"2026-10-09T03:{s // 60 % 60:02d}:{s % 60:02d}Z"

    def ev(level, msg, **kw):
        events.append({"t": stamp(), "level": level, "msg": msg, **kw})
    rid = 4700
    bad = "t-0417"
    for i in range(330):
        rid += 1
        t = rnd.choice(tenants)
        h = rnd.choice(handlers)
        if i == 112:
            ev("INFO", "config reload", tenant=bad, pool_size=2, was=10, source="tenants.d/t-0417.yaml")
        if i == 150:
            ev("INFO", "request start", req=f"r-{rid}", tenant=bad, handler="export", rows=250000)
            ev("INFO", "db connection acquired", req=f"r-{rid}", tenant=bad, pool_in_use=1, pool_size=2)
            holder = f"r-{rid}"
            continue
        if i == 154:
            ev("INFO", "request start", req=f"r-{rid}", tenant=bad, handler="export", rows=180000)
            ev("INFO", "db connection acquired", req=f"r-{rid}", tenant=bad, pool_in_use=2, pool_size=2)
            continue
        if i == 160:
            ev("INFO", "request start", req=f"r-{rid}", tenant=bad, handler="get_invoice")
            ev("WARN", "waiting for db connection", req=f"r-{rid}", tenant=bad, waited_ms=5000, pool_in_use=2, pool_size=2)
            ev("ERROR", "request failed", req=f"r-{rid}", tenant=bad, handler="get_invoice", status=500, error="TimeoutError: pool exhausted")
            first_bad = f"r-{rid}"
            continue
        ev("INFO", "request start", req=f"r-{rid}", tenant=t, handler=h)
        ev("INFO", "db connection acquired", req=f"r-{rid}", tenant=t, pool_in_use=rnd.randint(1, 4), pool_size=10)
        if rnd.random() < 0.06:
            ev("WARN", "slow query", req=f"r-{rid}", tenant=t, ms=rnd.randint(800, 2400))
        if rnd.random() < 0.03:
            ev("WARN", "retrying upstream call", req=f"r-{rid}", tenant=t, attempt=2)
        ev("INFO", "request done", req=f"r-{rid}", tenant=t, handler=h, status=200, ms=rnd.randint(4, 140))
    # a later, unrelated 500 from a different tenant (a decoy: the first failure is what was asked about)
    rid += 1
    ev("INFO", "request start", req=f"r-{rid}", tenant="t-0688", handler="search")
    ev("ERROR", "request failed", req=f"r-{rid}", tenant="t-0688", handler="search", status=500, error="ValueError: bad cursor")
    for i in range(30):
        rid += 1
        t = rnd.choice(tenants)
        ev("INFO", "request start", req=f"r-{rid}", tenant=t, handler=rnd.choice(handlers))
        ev("INFO", "request done", req=f"r-{rid}", tenant=t, status=200, ms=rnd.randint(4, 140))
    write("trace/logs/trace.jsonl", "".join(json.dumps(e) + "\n" for e in events))
    write("trace/tools/replay.py", REPLAY_PY)
    write("trace/Makefile", "replay:\n\tpython3 tools/replay.py logs/trace.jsonl\n")
    write("trace/README.md", "# trace\n\nA request trace from the api on 2026-10-09 and a script that prints it. `make replay` prints it as a log.\n")
    return {"first_bad": first_bad, "holder": holder}


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    make_slugify()
    make_tax()
    make_months()
    make_csv()
    make_semver()
    make_go()
    make_node()
    make_build()
    make_migrate()
    facts = make_replay()
    print("diagnosis facts:", facts)


if __name__ == "__main__":
    main()
