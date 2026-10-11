import unittest

from app.errors import HarborError
from app.refunds import refund


class RefundTest(unittest.TestCase):
    def test_refund_within_charge(self):
        self.assertEqual(refund(1000, 200, 300), 300)

    def test_refund_over_the_charge_raises(self):
        with self.assertRaises(HarborError):
            refund(1000, 900, 300)


if __name__ == "__main__":
    unittest.main()
