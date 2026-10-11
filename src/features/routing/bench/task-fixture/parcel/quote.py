"""A full quote: freight, rural fee, GST."""

from dataclasses import dataclass

from parcel.rates import calc_price
from parcel.units import chargeable_kg
from parcel.zones import RURAL_FEE, is_rural, zone_for


@dataclass(frozen=True)
class Quote:
    postcode: str
    zone: str
    chargeable_kg: float
    freight: int
    rural_fee: int
    subtotal: int
    gst: int
    total: int


def quote(postcode: str, weight_kg: float, dims_cm: tuple[float, float, float] | None = None) -> Quote:
    """Quote one parcel to a postcode."""
    zone = zone_for(postcode)
    kg = chargeable_kg(weight_kg, dims_cm)
    freight = calc_price(zone, kg)
    rural = RURAL_FEE if is_rural(postcode) else 0
    subtotal = freight + rural
    gst = round(subtotal * 0.15)
    return Quote(postcode, zone, kg, freight, rural, subtotal, gst, subtotal + gst)
