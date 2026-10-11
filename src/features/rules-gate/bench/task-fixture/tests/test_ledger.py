import unittest

from tallybook.ledger import Ledger


class LedgerTest(unittest.TestCase):
    def test_balance(self):
        ledger = Ledger()
        ledger.add_entry(500, "a")
        ledger.add_entry(-200, "b")
        self.assertEqual(ledger.balance(), 300)
