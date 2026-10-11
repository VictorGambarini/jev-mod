import unittest
from datetime import date

from billing.invoice import Invoice, LineItem, build_invoice, mark_paid, summary, void
from billing.sequence import Sequence, SequenceStore


def numbers() -> Sequence:
    return Sequence("invoice", "INV-", SequenceStore())


class BuildInvoiceTest(unittest.TestCase):
    def test_gst_on_the_net_total(self):
        inv = build_invoice("C-1", "NZ", [LineItem("Growth", 12900)], date(2026, 9, 1), numbers())
        self.assertEqual((inv.net_cents, inv.gst_cents, inv.total_cents), (12900, 1935, 14835))
        self.assertEqual(inv.number, "INV-000001")

    def test_numbers_follow_each_other(self):
        seq = numbers()
        a = build_invoice("C-1", "NZ", [LineItem("x", 100)], date(2026, 9, 1), seq)
        b = build_invoice("C-2", "AU", [LineItem("x", 100)], date(2026, 9, 1), seq)
        self.assertEqual((a.number, b.number), ("INV-000001", "INV-000002"))

    def test_gst_after_a_negative_line(self):
        inv = build_invoice("C-1", "NZ", [LineItem("Growth", 12900), LineItem("Coupon", -1290)], date(2026, 9, 1), numbers())
        self.assertEqual(inv.gst_cents, 1742)  # 15% of 11610 = 1741.5, half up

    def test_refuses_empty_and_negative(self):
        with self.assertRaises(ValueError):
            build_invoice("C-1", "NZ", [], date(2026, 9, 1), numbers())
        with self.assertRaises(ValueError):
            build_invoice("C-1", "NZ", [LineItem("refund", -100)], date(2026, 9, 1), numbers())


class StatusTest(unittest.TestCase):
    def test_paid_then_refundable(self):
        inv = build_invoice("C-1", "NZ", [LineItem("Growth", 12900)], date(2026, 9, 1), numbers())
        self.assertEqual(inv.refundable_cents, 0)
        mark_paid(inv)
        self.assertEqual(inv.refundable_cents, 14835)
        with self.assertRaises(ValueError):
            void(inv)

    def test_summary_is_plain_data(self):
        inv = build_invoice("C-9", "AU", [LineItem("Starter", 4900)], date(2026, 9, 3), numbers())
        s = summary(inv)
        self.assertEqual(s["issued_on"], "2026-09-03")
        self.assertEqual(s["lines"], [{"description": "Starter", "amount_cents": 4900}])


if __name__ == "__main__":
    unittest.main()
