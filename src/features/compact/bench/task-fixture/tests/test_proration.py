import unittest
from datetime import date

from billing.plans import get_plan
from billing.proration import days_between, prorate, proration_line, upgrade_charge

STARTER = get_plan("starter")
GROWTH = get_plan("growth")


class ProrateTest(unittest.TestCase):
    def test_full_cycle_is_the_whole_amount(self):
        self.assertEqual(prorate(4900, 30, 30), 4900)

    def test_nothing_used_is_zero(self):
        self.assertEqual(prorate(4900, 0, 30), 0)

    def test_exact_division(self):
        self.assertEqual(prorate(3000, 10, 30), 1000)

    def test_rounds_half_up(self):
        # 999 * 15 / 30 = 499.5
        self.assertEqual(prorate(999, 15, 30), 500)

    def test_rounds_half_up_on_odd_amounts(self):
        # 997 * 15 / 30 = 498.5: half up, not half to even
        self.assertEqual(prorate(997, 15, 30), 499)

    def test_refuses_days_outside_the_cycle(self):
        with self.assertRaises(ValueError):
            prorate(4900, 31, 30)


class UpgradeChargeTest(unittest.TestCase):
    def test_upgrade_in_a_30_day_cycle(self):
        # 15 of 30 days left: 6450 for Growth less 2450 back for Starter
        self.assertEqual(upgrade_charge(STARTER, GROWTH, date(2026, 9, 16), date(2026, 9, 1), date(2026, 10, 1)), 4000)

    def test_upgrade_in_a_31_day_cycle(self):
        # 16 of 31 days left: 12900*16/31 = 6658.06 -> 6658, 4900*16/31 = 2529.03 -> 2529
        self.assertEqual(upgrade_charge(STARTER, GROWTH, date(2026, 10, 16), date(2026, 10, 1), date(2026, 11, 1)), 4129)

    def test_upgrade_in_february(self):
        # 14 of 28 days left
        self.assertEqual(upgrade_charge(STARTER, GROWTH, date(2026, 2, 15), date(2026, 2, 1), date(2026, 3, 1)), 4000)

    def test_change_on_the_first_day_of_a_31_day_cycle(self):
        self.assertEqual(upgrade_charge(STARTER, GROWTH, date(2026, 8, 1), date(2026, 8, 1), date(2026, 9, 1)), 8000)

    def test_downgrade_is_a_credit(self):
        self.assertEqual(upgrade_charge(GROWTH, STARTER, date(2026, 9, 16), date(2026, 9, 1), date(2026, 10, 1)), -4000)

    def test_refuses_a_change_outside_the_cycle(self):
        with self.assertRaises(ValueError):
            upgrade_charge(STARTER, GROWTH, date(2026, 10, 2), date(2026, 9, 1), date(2026, 10, 1))


class HelpersTest(unittest.TestCase):
    def test_days_between(self):
        self.assertEqual(days_between(date(2026, 8, 1), date(2026, 9, 1)), 31)
        with self.assertRaises(ValueError):
            days_between(date(2026, 9, 1), date(2026, 8, 1))

    def test_proration_line(self):
        text, amount = proration_line(STARTER, GROWTH, date(2026, 9, 16), date(2026, 9, 1), date(2026, 10, 1))
        self.assertEqual(text, "Upgrade Starter to Growth from 2026-09-16")
        self.assertEqual(amount, 4000)


if __name__ == "__main__":
    unittest.main()
