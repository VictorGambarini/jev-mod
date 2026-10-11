from _common import cli, main, project_files
import unittest


class Check(unittest.TestCase):
    def test_cli_says_unknown(self):
        r = cli("quote", "--weight", "1", "--to", "9990")
        self.assertEqual(r.returncode, 2)
        self.assertIn("Unknown zone for postcode 9990", r.stderr)

    def test_api_says_unknown(self):
        from parcel.zones import UnknownZone, zone_for
        with self.assertRaises(UnknownZone) as caught:
            zone_for("abcd")
        self.assertIn("Unknown zone for postcode abcd", str(caught.exception))

    def test_no_typo_left(self):
        self.assertEqual([p for p, t in project_files() if "Unknwon" in t], [])


if __name__ == "__main__":
    main()
