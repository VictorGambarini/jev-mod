"""The plans customers can be on. Prices are per cycle, in cents, GST exclusive."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Plan:
    code: str
    name: str
    price_cents: int
    period: str  # "month" or "year"


PLANS = {
    "starter": Plan("starter", "Starter", 4900, "month"),
    "growth": Plan("growth", "Growth", 12900, "month"),
    "scale": Plan("scale", "Scale", 34900, "month"),
    "growth-annual": Plan("growth-annual", "Growth (annual)", 129000, "year"),
    "trial": Plan("trial", "Trial", 0, "month"),
}


def get_plan(code: str) -> Plan:
    """The plan with this code; KeyError names the codes there are."""
    try:
        return PLANS[code]
    except KeyError:
        raise KeyError(f"no plan {code!r}; plans are {', '.join(sorted(PLANS))}") from None
