"""Coupons. A coupon becomes one negative line on the invoice, before GST. One coupon per
invoice: they never stack."""

from dataclasses import dataclass

from .invoice import LineItem
from .money import round_half_up


@dataclass(frozen=True)
class Coupon:
    code: str
    percent_off: int = 0  # 0-100
    amount_off_cents: int = 0

    def __post_init__(self) -> None:
        if bool(self.percent_off) == bool(self.amount_off_cents):
            raise ValueError("a coupon is either a percentage or an amount off")
        if not 0 <= self.percent_off <= 100:
            raise ValueError("percent_off is 0-100")


def discount_line(coupon: Coupon, lines: list[LineItem]) -> LineItem:
    """The negative line a coupon adds; never more than the lines it discounts."""
    net = sum(line.amount_cents for line in lines)
    if coupon.percent_off:
        off = round_half_up(net * coupon.percent_off, 100)
    else:
        off = min(coupon.amount_off_cents, net)
    return LineItem(f"Coupon {coupon.code}", -off)


def apply_coupon(coupons: list[Coupon], lines: list[LineItem]) -> list[LineItem]:
    """The lines with at most one coupon applied: the one worth most."""
    if not coupons:
        return list(lines)
    best = min((discount_line(c, lines) for c in coupons), key=lambda line: line.amount_cents)
    return [*lines, best]
