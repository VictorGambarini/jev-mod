import unittest

from parcel.money import format_nzd, gst, round_half_up


class RoundHalfUpTest(unittest.TestCase):
    def test_rounds_halves_up(self):
        self.assertEqual(round_half_up(5, 2), 3)
        self.assertEqual(round_half_up(7, 2), 4)

    def test_rounds_below_half_down(self):
        self.assertEqual(round_half_up(149, 100), 1)

    def test_negative_halves_go_away_from_zero(self):
        self.assertEqual(round_half_up(-5, 2), -3)

    def test_gst(self):
        self.assertEqual(gst(1000), 150)
        self.assertEqual(gst(1190), 179)


class FormatTest(unittest.TestCase):
    def test_format(self):
        self.assertEqual(format_nzd(1234), "$12.34")
        self.assertEqual(format_nzd(5), "$0.05")
        self.assertEqual(format_nzd(-250), "-$2.50")


if __name__ == "__main__":
    unittest.main()
