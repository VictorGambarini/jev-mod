import unittest

from invoicer.invoice import Invoice


class InvoiceTest(unittest.TestCase):
    def test_subtotal(self):
        inv = Invoice([("a", 10.0, 2), ("b", 5.0, 1)])
        self.assertEqual(inv.sub, 25.0)

    def test_total(self):
        inv = Invoice([("a", 100.0, 1)])
        self.assertEqual(inv.total(), 115.0)


if __name__ == "__main__":
    unittest.main()
