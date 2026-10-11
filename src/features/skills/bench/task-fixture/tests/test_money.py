import unittest

from app.money import format_amount, parse_amount, split_evenly


class MoneyTest(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(parse_amount("$12.50"), 1250)
        self.assertEqual(parse_amount("1,000"), 100000)

    def test_format(self):
        self.assertEqual(format_amount(1250), "$12.50")
        self.assertEqual(format_amount(-5), "-$0.05")

    def test_split(self):
        self.assertEqual(split_evenly(100, 3), [34, 33, 33])


if __name__ == "__main__":
    unittest.main()
