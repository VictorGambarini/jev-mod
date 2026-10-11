import unittest

from billing.tax import gst_on, gst_portion, net_of, rate


class GstTest(unittest.TestCase):
    def test_nz_and_au_rates(self):
        self.assertEqual(rate("NZ"), (15, 100))
        self.assertEqual(rate("AU"), (10, 100))
        with self.assertRaises(ValueError):
            rate("US")

    def test_gst_on_a_net_amount(self):
        self.assertEqual(gst_on(12900, "NZ"), 1935)
        self.assertEqual(gst_on(4900, "AU"), 490)
        self.assertEqual(gst_on(3, "NZ"), 0)  # 0.45 rounds down

    def test_gst_inside_a_gross_amount(self):
        self.assertEqual(gst_portion(14835, "NZ"), 1935)
        self.assertEqual(gst_portion(1150, "NZ"), 150)
        self.assertEqual(net_of(14835, "NZ"), 12900)


if __name__ == "__main__":
    unittest.main()
