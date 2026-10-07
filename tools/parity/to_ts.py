#!/usr/bin/env python3
"""Write each test/parity/fixtures/<name>.json as test/parity/fixtures/<name>.ts.

The plugin test runner loads code files only, so the parity tests import these .ts copies.
The JSON stays the source of truth (tools/parity/capture.py writes it); run this after a
capture. With --check it changes nothing and exits 1 if any copy is missing or stale.
"""
import json
import sys
from pathlib import Path

FIXTURES = Path(__file__).resolve().parents[2] / "test" / "parity" / "fixtures"


def render(path: Path) -> str:
    data = json.loads(path.read_text(encoding="utf-8"))
    return (f"// Generated from {path.name} by tools/parity/to_ts.py. Do not edit.\n"
            f"export default {json.dumps(data, ensure_ascii=False, indent=1)}\n")


def main() -> int:
    check = "--check" in sys.argv
    stale = []
    for path in sorted(FIXTURES.glob("*.json")):
        target, text = path.with_suffix(".ts"), render(path)
        if target.exists() and target.read_text(encoding="utf-8") == text:
            continue
        stale.append(target.name)
        if not check:
            target.write_text(text, encoding="utf-8")
    if stale:
        print(("stale: " if check else "wrote: ") + ", ".join(stale))
    return 1 if check and stale else 0


if __name__ == "__main__":
    sys.exit(main())
