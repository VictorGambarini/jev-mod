import unittest

from tallybook.money import add, format_cents


class MoneyTest(unittest.TestCase):
    def test_add(self):
        self.assertEqual(add(100, 250), 350)

    def test_format(self):
        self.assertEqual(format_cents(1050), "10.50")
