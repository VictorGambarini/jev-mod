import unittest

from _common import cli, main, tests_mention


def eta(booked: str, service: str) -> str:
    return cli("eta", "--booked", booked, "--service", service).stdout.strip()


class Check(unittest.TestCase):
    def test_labour_day(self):
        self.assertEqual(eta("2026-10-23 10:00", "1"), "Delivery by Tue 27 Oct 2026")

    def test_christmas(self):
        self.assertEqual(eta("2026-12-24 10:00", "1"), "Delivery by Tue 29 Dec 2026")

    def test_ordinary_week_unchanged(self):
        self.assertEqual(eta("2026-10-21 10:00", "2"), "Delivery by Fri 23 Oct 2026")

    def test_tests_added(self):
        self.assertTrue(tests_mention(r"(?i)holiday"))


if __name__ == "__main__":
    main()
