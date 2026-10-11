import re
import unittest

from _common import cli, main, project_files


class Check(unittest.TestCase):
    def test_new_name(self):
        from parcel.rates import freight_price
        self.assertEqual(freight_price("W", 2.5), 1045 + 3 * 137)

    def test_old_name_gone(self):
        self.assertEqual([p for p, t in project_files() if re.search(r"\bcalc_price\b", t)], [])

    def test_quotes_still_work(self):
        self.assertEqual(cli("quote", "--weight", "2.5", "--to", "6011").stdout.splitlines()[-1], "Total: $16.74")


if __name__ == "__main__":
    main()
