"""The parcel command."""

import argparse
import sys
from datetime import datetime, timedelta, timezone

from parcel.dates import estimate_delivery
from parcel.money import format_nzd
from parcel.quote import quote
from parcel.report import read_rows, render, summarise
from parcel.units import lb_to_kg
from parcel.zones import UnknownZone

NZ = timezone(timedelta(hours=13), "NZDT")


def parse_dims(text: str) -> tuple[float, float, float]:
    """'40x30x20' -> (40.0, 30.0, 20.0), in cm."""
    parts = [float(p) for p in text.lower().split("x")]
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("dims are LxWxH in cm, like 40x30x20")
    return parts[0], parts[1], parts[2]


def cmd_quote(args: argparse.Namespace) -> int:
    weight = lb_to_kg(args.weight) if args.lb else args.weight
    q = quote(args.to, weight, args.dims)
    print(f"Zone: {q.zone}")
    print(f"Chargeable weight: {q.chargeable_kg} kg")
    print(f"Freight: {format_nzd(q.freight)}")
    print(f"Rural delivery: {format_nzd(q.rural_fee)}")
    print(f"GST: {format_nzd(q.gst)}")
    print(f"Total: {format_nzd(q.total)}")
    return 0


def cmd_eta(args: argparse.Namespace) -> int:
    # bookings are stored in UTC
    booked = datetime.strptime(args.booked, "%Y-%m-%d %H:%M").replace(tzinfo=NZ).astimezone(timezone.utc)
    arrives = estimate_delivery(booked, args.service)
    print(f"Delivery by {arrives.strftime('%a %d %b %Y')}")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    print(render(summarise(read_rows(args.csv))))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="parcel", description="Kererū Couriers quotes, ETAs and reports")
    sub = parser.add_subparsers(dest="command", required=True)
    q = sub.add_parser("quote", help="quote one parcel")
    q.add_argument("--weight", type=float, required=True, help="weight in kg (or lb with --lb)")
    q.add_argument("--lb", action="store_true", help="the weight is in pounds")
    q.add_argument("--to", required=True, help="the destination postcode")
    q.add_argument("--dims", type=parse_dims, help="LxWxH in cm")
    q.set_defaults(run=cmd_quote)
    e = sub.add_parser("eta", help="when a parcel arrives")
    e.add_argument("--booked", required=True, help='"YYYY-MM-DD HH:MM", NZ time')
    e.add_argument("--service", type=int, default=1, help="business days")
    e.set_defaults(run=cmd_eta)
    r = sub.add_parser("report", help="a month's totals from a CSV export")
    r.add_argument("csv")
    r.set_defaults(run=cmd_report)
    args = parser.parse_args(argv)
    try:
        return args.run(args)
    except UnknownZone as err:
        print(f"error: {err}", file=sys.stderr)
        return 2
