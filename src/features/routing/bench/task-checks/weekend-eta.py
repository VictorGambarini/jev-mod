import unittest
from datetime import date, datetime

from _common import cli, main


def eta(booked: str, service: str) -> str:
    return cli("eta", "--booked", booked, "--service", service).stdout.strip()


class Check(unittest.TestCase):
    def test_weekend_booking(self):
        from parcel.dates import estimate_delivery
        self.assertEqual(estimate_delivery(datetime(2026, 10, 10, 10, 0), 1), date(2026, 10, 13))
        self.assertEqual(estimate_delivery(datetime(2026, 10, 11, 9, 0), 2), date(2026, 10, 14))
        self.assertEqual(estimate_delivery(datetime(2026, 10, 10, 16, 0), 1), date(2026, 10, 13))

    def test_weekdays_unchanged(self):
        from parcel.dates import estimate_delivery
        self.assertEqual(estimate_delivery(datetime(2026, 10, 7, 9, 0), 1), date(2026, 10, 8))
        self.assertEqual(estimate_delivery(datetime(2026, 10, 7, 15, 30), 1), date(2026, 10, 9))
        self.assertEqual(estimate_delivery(datetime(2026, 10, 9, 11, 0), 2), date(2026, 10, 13))

    def test_cli_cutoff_in_nz_time(self):
        self.assertEqual(eta("2026-10-08 16:30", "1"), "Delivery by Mon 12 Oct 2026")
        self.assertEqual(eta("2026-10-08 14:59", "1"), "Delivery by Fri 09 Oct 2026")
        self.assertEqual(eta("2026-10-08 15:00", "1"), "Delivery by Mon 12 Oct 2026")

    def test_cli_weekend(self):
        self.assertEqual(eta("2026-10-10 10:00", "1"), "Delivery by Tue 13 Oct 2026")


if __name__ == "__main__":
    main()
