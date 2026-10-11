import csv
import io
import unittest
from datetime import date

from billing.export import COLUMNS, to_csv
from billing.invoice import LineItem, build_invoice
from billing.sequence import Sequence, SequenceStore


def invoice(customer_id: str):
    return build_invoice(customer_id, "NZ", [LineItem("Growth", 12900)], date(2026, 9, 1), Sequence("invoice", "INV-", SequenceStore()))


class ExportTest(unittest.TestCase):
    def test_header_and_one_row(self):
        rows = list(csv.reader(io.StringIO(to_csv([(invoice("C-1"), "Kowhai Labs")]))))
        self.assertEqual(rows[0], COLUMNS)
        self.assertEqual(rows[1][:3], ["INV-000001", "C-1", "Kowhai Labs"])

    def test_csv_escapes_commas_in_customer_names(self):
        rows = list(csv.reader(io.StringIO(to_csv([(invoice("C-2"), "Smith, Tane & Co")]))))
        self.assertEqual(rows[1][2], "Smith, Tane & Co")
        self.assertEqual(len(rows[1]), len(COLUMNS))


if __name__ == "__main__":
    unittest.main()
