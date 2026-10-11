import unittest

from parcel.rates import calc_price


class RatesTest(unittest.TestCase):
    def test_first_kilogram_is_the_base(self):
        self.assertEqual(calc_price("A", 0.5), 655)
        self.assertEqual(calc_price("A", 1.0), 655)

    def test_each_extra_half_kilogram(self):
        self.assertEqual(calc_price("W", 2.5), 1045 + 3 * 137)
        self.assertEqual(calc_price("S", 6.0), 1349 + 10 * 173)


if __name__ == "__main__":
    unittest.main()
