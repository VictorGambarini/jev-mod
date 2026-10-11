import unittest

from app.client import fetch


class ClientTest(unittest.TestCase):
    def test_fetch(self):
        self.assertEqual(fetch(lambda url: "ok:" + url, "u"), "ok:u")


if __name__ == "__main__":
    unittest.main()
