import unittest

from generated.models import Invoice


class InvoiceTest(unittest.TestCase):
    def test_total_without_discount(self):
        self.assertEqual(Invoice([1000, 500]).total(), 1500)

    def test_total_rounds_half_up(self):
        self.assertEqual(Invoice([1050], discount_pct=15).total(), 893)
