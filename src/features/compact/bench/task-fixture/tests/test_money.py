import unittest
from decimal import Decimal

from billing.money import allocate, fmt, round_half_up, to_cents


class ToCentsTest(unittest.TestCase):
    def test_strings_and_decimals(self):
        self.assertEqual(to_cents("49.00"), 4900)
        self.assertEqual(to_cents(Decimal("0.005")), 1)
        self.assertEqual(to_cents(12), 1200)

    def test_refuses_floats(self):
        with self.assertRaises(TypeError):
            to_cents(0.1)


class RoundHalfUpTest(unittest.TestCase):
    def test_halves_go_up(self):
        self.assertEqual(round_half_up(5, 2), 3)
        self.assertEqual(round_half_up(14955, 30), 499)

    def test_halves_of_negatives_go_away_from_zero(self):
        self.assertEqual(round_half_up(-5, 2), -3)

    def test_below_half_goes_down(self):
        self.assertEqual(round_half_up(14, 10), 1)

    def test_refuses_a_zero_denominator(self):
        with self.assertRaises(ValueError):
            round_half_up(1, 0)


class AllocateTest(unittest.TestCase):
    def test_parts_add_up(self):
        self.assertEqual(allocate(100, [1, 1, 1]), [34, 33, 33])
        self.assertEqual(sum(allocate(12900, [31, 15, 7])), 12900)


class FmtTest(unittest.TestCase):
    def test_formats(self):
        self.assertEqual(fmt(123450), "$1,234.50")
        self.assertEqual(fmt(-5, "AUD"), "-A$0.05")


if __name__ == "__main__":
    unittest.main()
