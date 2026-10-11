import unittest
from datetime import datetime, timezone

from billing.dunning import next_retry, schedule, suspend_at

FAILED = datetime(2026, 9, 10, 2, 0, tzinfo=timezone.utc)


class DunningTest(unittest.TestCase):
    def test_schedule_from_config(self):
        self.assertEqual(schedule(), ([1, 3, 5, 7], 14))

    def test_retries_then_none(self):
        self.assertEqual(next_retry(FAILED, 0), datetime(2026, 9, 11, 2, 0, tzinfo=timezone.utc))
        self.assertEqual(next_retry(FAILED, 3), datetime(2026, 9, 17, 2, 0, tzinfo=timezone.utc))
        self.assertIsNone(next_retry(FAILED, 4))

    def test_suspends_after_two_weeks(self):
        self.assertEqual(suspend_at(FAILED), datetime(2026, 9, 24, 2, 0, tzinfo=timezone.utc))


if __name__ == "__main__":
    unittest.main()
