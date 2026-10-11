import io
import unittest
from contextlib import redirect_stdout

from invoicer.cli import main


class CliTest(unittest.TestCase):
    def test_report(self):
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(main(["report", "data/sample.json"]), 0)
        self.assertIn("subtotal", out.getvalue())


if __name__ == "__main__":
    unittest.main()
