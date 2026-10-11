"""The monthly shipments report."""

import csv
from dataclasses import dataclass

from parcel.money import format_nzd
from parcel.quote import Quote, quote


@dataclass(frozen=True)
class Summary:
    count: int
    subtotal: int
    gst: int
    total: int


def read_rows(path: str) -> list[dict[str, str]]:
    """The shipments in a CSV export (id, postcode, weight_kg, length_cm, width_cm, height_cm)."""
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def quote_row(row: dict[str, str]) -> Quote:
    """The quote for one shipment of the export."""
    postcode = str(int(row["postcode"]))  # the export pads some postcodes with spaces
    return quote(postcode, float(row["weight_kg"]))


def summarise(rows: list[dict[str, str]]) -> Summary:
    """The month's totals."""
    quotes = [quote_row(r) for r in rows]
    subtotal = sum(q.subtotal for q in quotes)
    return Summary(
        count=len(quotes),
        subtotal=subtotal,
        gst=round(subtotal * 0.15),
        total=sum(q.total for q in quotes),
    )


def render(s: Summary) -> str:
    """The report as printed."""
    return "\n".join([
        f"Shipments: {s.count}",
        f"Subtotal: {format_nzd(s.subtotal)}",
        f"GST: {format_nzd(s.gst)}",
        f"Total: {format_nzd(s.total)}",
    ])
