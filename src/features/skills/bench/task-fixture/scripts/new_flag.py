#!/usr/bin/env python3
"""Add a feature flag to config/flags.toml.

usage: scripts/new_flag.py <name> <owner-team> [--default true|false]

The entry gets a sunset date 90 days out and a checksum that scripts/check_flags.py verifies.
"""
import datetime
import hashlib
import pathlib
import re
import sys

FLAGS = pathlib.Path(__file__).resolve().parent.parent / "config" / "flags.toml"


def checksum(name: str, owner: str, default: str) -> str:
    return hashlib.sha1(f"{name}:{owner}:{default}".encode()).hexdigest()[:8]


def main(argv: list[str]) -> int:
    if len(argv) < 2 or not re.fullmatch(r"[a-z][a-z0-9_]*", argv[0]):
        print(__doc__)
        return 2
    name, owner = argv[0], argv[1]
    default = "false"
    if "--default" in argv:
        default = argv[argv.index("--default") + 1]
    if f"[flags.{name}]" in FLAGS.read_text():
        print(f"flag {name} already exists")
        return 1
    sunset = datetime.date.today() + datetime.timedelta(days=90)
    block = (
        f"\n[flags.{name}]\n"
        f'owner = "{owner}"\n'
        f"default = {default}\n"
        f'sunset = "{sunset.isoformat()}"\n'
        f'checksum = "{checksum(name, owner, default)}"\n'
    )
    with FLAGS.open("a") as f:
        f.write(block)
    print(f"added flags.{name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
