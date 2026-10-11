"""Postcodes to zones, and rural delivery."""


class UnknownZone(ValueError):
    """A postcode we do not deliver to."""


# (zone, first postcode, last postcode)
ZONES = [
    ("N", 100, 599),    # Northland
    ("A", 600, 2699),   # Auckland
    ("W", 3000, 6999),  # rest of the North Island
    ("S", 7000, 9899),  # South Island
]

# Rural delivery postcodes: a flat fee on top of the freight.
RURAL_POSTCODES = {"0110", "0181", "0472", "3881", "4386", "7072", "7183", "9585"}
RURAL_FEE = 450


def zone_for(postcode: str) -> str:
    """The zone letter a postcode is in."""
    try:
        n = int(postcode)
    except ValueError:
        raise UnknownZone(f"Unknwon zone for postcode {postcode}") from None
    for zone, first, last in ZONES:
        if first <= n <= last:
            return zone
    raise UnknownZone(f"Unknwon zone for postcode {postcode}")


def is_rural(postcode: str) -> bool:
    """Whether a postcode is on a rural delivery run."""
    return postcode in RURAL_POSTCODES
