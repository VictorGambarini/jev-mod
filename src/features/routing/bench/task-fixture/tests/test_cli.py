import contextlib
import io
import unittest

from parcel.cli import main


def run(*argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = main(list(argv))
    return code, out.getvalue(), err.getvalue()


class CliTest(unittest.TestCase):
    def test_quote(self):
        code, out, _ = run("quote", "--weight", "1.8", "--to", "1010")
        self.assertEqual(code, 0)
        self.assertIn("Zone: A", out)
        self.assertIn("Total: $9.65", out)

    def test_quote_with_dims(self):
        code, out, _ = run("quote", "--weight", "1", "--to", "1010", "--dims", "40x30x25")
        self.assertIn("Chargeable weight: 6.0 kg", out)

    def test_unknown_postcode(self):
        code, _, err = run("quote", "--weight", "1", "--to", "9990")
        self.assertEqual(code, 2)
        self.assertIn("9990", err)

    def test_eta(self):
        code, out, _ = run("eta", "--booked", "2026-10-08 10:00", "--service", "1")
        self.assertEqual(code, 0)
        self.assertIn("Delivery by Fri 09 Oct 2026", out)


if __name__ == "__main__":
    unittest.main()
