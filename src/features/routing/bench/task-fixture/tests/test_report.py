import os
import tempfile
import unittest

from parcel.report import read_rows, render, summarise

CSV = """id,postcode,weight_kg,length_cm,width_cm,height_cm
KC-1,1010,1.8,20,15,10
KC-2,6011,0.6,20,15,10
"""


class ReportTest(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".csv")
        with os.fdopen(fd, "w") as f:
            f.write(CSV)

    def tearDown(self):
        os.remove(self.path)

    def test_summary(self):
        s = summarise(read_rows(self.path))
        self.assertEqual(s.count, 2)
        self.assertEqual(s.subtotal, 839 + 1045)
        self.assertEqual(s.total, 965 + 1202)

    def test_render(self):
        text = render(summarise(read_rows(self.path)))
        self.assertIn("Shipments: 2", text)
        self.assertIn("Total: $21.67", text)


if __name__ == "__main__":
    unittest.main()
