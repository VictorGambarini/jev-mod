import os
import tempfile
import unittest

from _common import WORK, cents, cli, line, main

HIDDEN_CSV = """id,postcode,weight_kg,length_cm,width_cm,height_cm
H-1,0110,0.5,20,15,10
H-2, 0472,2.0,60,40,40
H-3,7183,1.0,80,50,40
H-4,1010 ,3.0,10,10,10
H-5,0505,12.0,30,30,30
"""


def expected(path: str) -> tuple[int, int, int]:
    import csv
    from parcel.quote import quote
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    qs = [quote(r["postcode"].strip(), float(r["weight_kg"]), (float(r["length_cm"]), float(r["width_cm"]), float(r["height_cm"])))
          for r in rows]
    return len(qs), sum(q.subtotal for q in qs), sum(q.total for q in qs)


class Check(unittest.TestCase):
    def agrees(self, path: str):
        count, subtotal, total = expected(path)
        out = cli("report", path).stdout
        self.assertEqual(line(out, "Shipments"), str(count))
        self.assertEqual(cents(line(out, "Subtotal")), subtotal)
        self.assertEqual(cents(line(out, "Total")), total)

    def test_month(self):
        self.agrees("data/shipments.csv")

    def test_hidden_month(self):
        fd, path = tempfile.mkstemp(suffix=".csv", dir=WORK)
        try:
            with os.fdopen(fd, "w") as f:
                f.write(HIDDEN_CSV)
            self.agrees(path)
        finally:
            os.remove(path)

    def test_postcode_kept_as_written(self):
        from parcel.report import quote_row
        q = quote_row({"id": "x", "postcode": " 0110", "weight_kg": "1", "length_cm": "1", "width_cm": "1", "height_cm": "1"})
        self.assertEqual((q.postcode, q.rural_fee), ("0110", 450))


if __name__ == "__main__":
    main()
