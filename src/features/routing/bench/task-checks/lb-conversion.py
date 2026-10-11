import unittest

from _common import BASE, PER_HALF_KG, cli, line, main, nzd, ref_gst


class Check(unittest.TestCase):
    def test_lb_to_kg(self):
        from parcel.units import lb_to_kg
        self.assertAlmostEqual(lb_to_kg(10), 4.5359237, places=6)
        self.assertAlmostEqual(lb_to_kg(1), 0.45359237, places=8)

    def test_cli_quotes_pounds(self):
        out = cli("quote", "--weight", "10", "--lb", "--to", "6011").stdout
        self.assertEqual(line(out, "Chargeable weight"), "5.0 kg")
        freight = BASE["W"] + PER_HALF_KG["W"] * 8
        self.assertEqual(line(out, "Total"), nzd(freight + ref_gst(freight)))

    def test_kilograms_unchanged(self):
        self.assertEqual(line(cli("quote", "--weight", "2.5", "--to", "6011").stdout, "Total"), "$16.74")


if __name__ == "__main__":
    main()
