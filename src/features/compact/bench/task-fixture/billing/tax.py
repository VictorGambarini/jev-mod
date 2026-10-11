"""GST. Prices are GST exclusive; an invoice adds GST on its net total, rounded half up."""

from .money import round_half_up

# region: (numerator, denominator) of the GST rate
GST_RATES = {"NZ": (15, 100), "AU": (10, 100)}


def rate(region: str) -> tuple[int, int]:
    """The GST rate of a region as a fraction."""
    try:
        return GST_RATES[region]
    except KeyError:
        raise ValueError(f"no GST rate for region {region!r}") from None


def gst_on(net_cents: int, region: str) -> int:
    """GST to add to a net amount."""
    num, den = rate(region)
    return round_half_up(net_cents * num, den)


def gst_portion(gross_cents: int, region: str) -> int:
    """The GST inside a GST-inclusive amount (15/115 of it in NZ)."""
    num, den = rate(region)
    return round_half_up(gross_cents * num, den + num)


def net_of(gross_cents: int, region: str) -> int:
    """A GST-inclusive amount without its GST."""
    return gross_cents - gst_portion(gross_cents, region)
