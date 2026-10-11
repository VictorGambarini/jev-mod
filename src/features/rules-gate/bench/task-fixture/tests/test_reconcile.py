import unittest

from tallybook.reconcile import reconcile


class ReconcileTest(unittest.TestCase):
    def test_total(self):
        result = reconcile([{"id": 1, "amount_cents": 100}, {"id": 2, "amount_cents": 250}])
        self.assertEqual(result.total_cents, 350)
        self.assertEqual(result.used, 2)
