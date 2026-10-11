import unittest

from shop.pricing import bulk_discount, order_total, tax_cents


class PricingTest(unittest.TestCase):
    def test_bulk_discount_starts_at_ten(self):
        self.assertEqual(bulk_discount(1000, 9), 0)
        self.assertEqual(bulk_discount(1000, 10), 100)

    def test_tax_rounds_half_up(self):
        self.assertEqual(tax_cents(1000), 150)
        self.assertEqual(tax_cents(10), 2)

    def test_order_total(self):
        got = order_total([{"unit_cents": 500, "qty": 10}, {"unit_cents": 300, "qty": 1}])
        self.assertEqual(got, {"subtotal": 5300, "discount": 500, "tax": 720, "total": 5520})
