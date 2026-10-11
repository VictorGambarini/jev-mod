import unittest
from datetime import date, datetime

from parcel.dates import estimate_delivery, next_business_day


class DatesTest(unittest.TestCase):
    def test_next_business_day_skips_the_weekend(self):
        self.assertEqual(next_business_day(date(2026, 10, 9)), date(2026, 10, 12))

    def test_before_cutoff_is_picked_up_the_same_day(self):
        self.assertEqual(estimate_delivery(datetime(2026, 10, 7, 9, 0), 1), date(2026, 10, 8))

    def test_after_cutoff_is_picked_up_the_next_day(self):
        self.assertEqual(estimate_delivery(datetime(2026, 10, 7, 15, 30), 1), date(2026, 10, 9))

    def test_friday_two_day_service(self):
        self.assertEqual(estimate_delivery(datetime(2026, 10, 9, 11, 0), 2), date(2026, 10, 13))


if __name__ == "__main__":
    unittest.main()
