import re
import unittest

from _common import cli, main, nzd, tests_mention

ZONE_LINE = re.compile(r"^([A-Z]):\s*(\d+) parcels?, (\$\d+\.\d\d)\s*$", re.M)


def expected(path: str) -> list[tuple[str, str, str]]:
    from parcel.report import quote_row, read_rows
    by: dict[str, list[int]] = {}
    for row in read_rows(path):
        q = quote_row(row)
        by.setdefault(q.zone, []).append(q.total)
    return [(z, str(len(t)), nzd(sum(t))) for z, t in sorted(by.items())]


class Check(unittest.TestCase):
    def test_by_zone(self):
        out = cli("report", "data/shipments.csv", "--by-zone").stdout
        self.assertEqual(ZONE_LINE.findall(out), expected("data/shipments.csv"))
        self.assertRegex(out, r"(?m)^Total: \$")

    def test_plain_report_unchanged(self):
        out = cli("report", "data/shipments.csv").stdout
        self.assertEqual(ZONE_LINE.findall(out), [])
        self.assertRegex(out, r"(?m)^Shipments: 30$")

    def test_tests_added(self):
        self.assertTrue(tests_mention(r"by[_-]zone"))


if __name__ == "__main__":
    main()
