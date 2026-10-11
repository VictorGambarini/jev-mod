import unittest

from parcel.units import chargeable_kg, volumetric_kg


class UnitsTest(unittest.TestCase):
    def test_volumetric(self):
        self.assertAlmostEqual(volumetric_kg(40, 30, 25), 6.0)

    def test_chargeable_rounds_up_to_half_kg(self):
        self.assertEqual(chargeable_kg(2.1), 2.5)
        self.assertEqual(chargeable_kg(2.5), 2.5)
        self.assertEqual(chargeable_kg(0.2), 0.5)

    def test_chargeable_takes_volumetric_when_larger(self):
        self.assertEqual(chargeable_kg(1.0, (40, 30, 25)), 6.0)
        self.assertEqual(chargeable_kg(9.0, (40, 30, 25)), 9.0)


if __name__ == "__main__":
    unittest.main()
