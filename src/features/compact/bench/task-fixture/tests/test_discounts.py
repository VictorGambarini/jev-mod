import unittest

from billing.discounts import Coupon, apply_coupon, discount_line
from billing.invoice import LineItem

LINES = [LineItem("Growth", 12900)]


class CouponTest(unittest.TestCase):
    def test_percent_off(self):
        self.assertEqual(discount_line(Coupon("TEN", percent_off=10), LINES).amount_cents, -1290)

    def test_amount_off_never_exceeds_the_lines(self):
        self.assertEqual(discount_line(Coupon("BIG", amount_off_cents=50000), LINES).amount_cents, -12900)

    def test_one_coupon_only_the_best(self):
        out = apply_coupon([Coupon("TEN", percent_off=10), Coupon("TWENTY", amount_off_cents=2000)], LINES)
        self.assertEqual([l.description for l in out], ["Growth", "Coupon TWENTY"])

    def test_a_coupon_is_one_kind(self):
        with self.assertRaises(ValueError):
            Coupon("BOTH", percent_off=10, amount_off_cents=100)


if __name__ == "__main__":
    unittest.main()
