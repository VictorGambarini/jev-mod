import unittest

from parcel.quote import quote


class QuoteTest(unittest.TestCase):
    def test_town_parcel(self):
        q = quote("1010", 1.8)
        self.assertEqual((q.zone, q.chargeable_kg, q.freight, q.rural_fee), ("A", 2.0, 839, 0))
        self.assertEqual((q.subtotal, q.gst, q.total), (839, 126, 965))

    def test_rural_parcel_pays_the_fee(self):
        q = quote("0472", 0.9)
        self.assertEqual((q.zone, q.freight, q.rural_fee, q.subtotal), ("N", 945, 450, 1395))
        self.assertEqual(q.total, 1395 + 209)


if __name__ == "__main__":
    unittest.main()
