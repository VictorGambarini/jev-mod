import unittest

from app.orders import Order, line_from_row


class OrderTest(unittest.TestCase):
    def test_total(self):
        order = Order("o1", [line_from_row("A", "$2.50", 2), line_from_row("B", "1.00")])
        self.assertEqual(order.total(), 600)


if __name__ == "__main__":
    unittest.main()
