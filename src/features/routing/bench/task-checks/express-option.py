import unittest

from _common import cli, line, main, nzd, tests_mention

GRID = [("6011", 2.5), ("0110", 0.7), ("1010", 4.2), ("7010", 12.0), ("3881", 1.1)]


def round_half_up(n: int, d: int) -> int:
    return (2 * n + d) // (2 * d)


class Check(unittest.TestCase):
    def test_api(self):
        from parcel.quote import quote
        for pc, kg in GRID:
            plain, fast = quote(pc, kg), quote(pc, kg, express=True)
            self.assertEqual(fast.freight, round_half_up(plain.freight * 140, 100), (pc, kg))
            self.assertEqual(fast.subtotal, fast.freight + plain.rural_fee, (pc, kg))
            self.assertEqual(fast.total, fast.subtotal + fast.gst, (pc, kg))
            self.assertEqual(quote(pc, kg, express=False), plain)

    def test_cli(self):
        from parcel.quote import quote
        out = cli("quote", "--weight", "2.5", "--to", "6011", "--express").stdout
        self.assertEqual(line(out, "Total"), nzd(quote("6011", 2.5, express=True).total))
        self.assertEqual(line(cli("quote", "--weight", "2.5", "--to", "6011").stdout, "Total"), "$16.74")

    def test_tests_added(self):
        self.assertTrue(tests_mention(r"express"))


if __name__ == "__main__":
    main()
