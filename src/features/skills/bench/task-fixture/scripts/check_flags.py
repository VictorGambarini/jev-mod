#!/usr/bin/env python3
"""Validate config/flags.toml: every flag has an owner, a default, a sunset date and the right checksum."""
import hashlib
import pathlib
import sys
import tomllib

FLAGS = pathlib.Path(__file__).resolve().parent.parent / "config" / "flags.toml"


def main() -> int:
    data = tomllib.loads(FLAGS.read_text())
    bad = 0
    for name, f in data.get("flags", {}).items():
        want = hashlib.sha1(f"{name}:{f.get('owner')}:{str(f.get('default')).lower()}".encode()).hexdigest()[:8]
        if f.get("checksum") != want:
            print(f"flags.{name}: checksum is {f.get('checksum')}, expected {want}")
            bad += 1
        for key in ("owner", "default", "sunset"):
            if key not in f:
                print(f"flags.{name}: missing {key}")
                bad += 1
    print("ok" if not bad else f"{bad} problem(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
