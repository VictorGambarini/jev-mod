import unittest

from parcel.zones import UnknownZone, is_rural, zone_for


class ZonesTest(unittest.TestCase):
    def test_zones(self):
        self.assertEqual(zone_for("0110"), "N")
        self.assertEqual(zone_for("1010"), "A")
        self.assertEqual(zone_for("6011"), "W")
        self.assertEqual(zone_for("7010"), "S")

    def test_unknown_postcode(self):
        with self.assertRaises(UnknownZone):
            zone_for("9990")
        with self.assertRaises(UnknownZone):
            zone_for("abcd")

    def test_rural(self):
        self.assertTrue(is_rural("0472"))
        self.assertFalse(is_rural("1010"))


if __name__ == "__main__":
    unittest.main()
