"""The freight price list."""

# cents for the first kilogram, and for each extra 0.5 kg
BASE = {"N": 945, "A": 655, "W": 1045, "S": 1349}
PER_HALF_KG = {"N": 118, "A": 92, "W": 137, "S": 173}


def calc_price(zone: str, chargeable_kg: float) -> int:
    """The freight for a parcel of this chargeable weight to this zone, in cents."""
    extra_halves = max(0, int(round((chargeable_kg - 1) * 2)))
    return BASE[zone] + PER_HALF_KG[zone] * extra_halves
