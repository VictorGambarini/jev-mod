import unittest

from invoicer.tax import tax, with_tax


class TaxTest(unittest.TestCase):
    def test_round_amount(self):
        self.assertEqual(tax(100), 15.0)

    def test_with_tax(self):
        self.assertEqual(with_tax(100), 115.0)


if __name__ == "__main__":
    unittest.main()
