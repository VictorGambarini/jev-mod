import os
import unittest

from notekeeper.cli import main
from notekeeper.store import Store


class CliTest(unittest.TestCase):
    def test_add_returns_zero(self):
        path = "data/test_cli.db"
        if os.path.exists(path):
            os.remove(path)
        os.environ["NOTEKEEPER_DB"] = path
        Store(path).ensure()
        self.assertEqual(main(["add", "t", "b"]), 0)
        os.remove(path)


if __name__ == "__main__":
    unittest.main()
