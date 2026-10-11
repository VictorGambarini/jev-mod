import os
import tempfile
import unittest

from _common import WORK, cents, cli, line, main, ref_gst

POSTCODES = ["0110", "0505", "1010", "3881", "6011", "7010", "7072", "8011"]
EDGE_CSV = """id,postcode,weight_kg,length_cm,width_cm,height_cm
E-1,6011,13.5,20,15,10
E-2,3881,8.5,20,15,10
E-3,7010,19.5,20,15,10
E-4,1010,1.8,20,15,10
"""


class Check(unittest.TestCase):
    def test_quotes(self):
        from parcel.quote import quote
        for pc in POSTCODES:
            for halves in range(1, 41):
                q = quote(pc, halves / 2)
                self.assertEqual((q.gst, q.total), (ref_gst(q.subtotal), q.subtotal + ref_gst(q.subtotal)), (pc, halves / 2))

    def test_cli(self):
        out = cli("quote", "--weight", "13.5", "--to", "6011").stdout
        self.assertEqual((line(out, "GST"), line(out, "Total")), ("$6.71", "$51.41"))

    def report_agrees(self, path: str):
        from parcel.report import quote_row, read_rows
        per_parcel = sum(ref_gst(quote_row(r).subtotal) for r in read_rows(path))
        out = cli("report", path).stdout
        self.assertEqual(cents(line(out, "GST")), per_parcel)
        self.assertEqual(cents(line(out, "Total")), cents(line(out, "Subtotal")) + per_parcel)

    def test_report(self):
        self.report_agrees("data/shipments.csv")

    def test_report_edge_cases(self):
        fd, path = tempfile.mkstemp(suffix=".csv", dir=WORK)
        try:
            with os.fdopen(fd, "w") as f:
                f.write(EDGE_CSV)
            self.report_agrees(path)
        finally:
            os.remove(path)


if __name__ == "__main__":
    main()
