#!/usr/bin/env python3
"""Write each test/parity/fixtures/<name>.json as test/parity/fixtures/<name>.ts.

The plugin test runner loads code files only, and none over 1 MB, so the parity tests import
these .ts copies, and a list too big for one file is written in parts that <name>.ts joins.
The JSON stays the source of truth (tools/parity/capture.py writes it); run this after a
capture. With --check it changes nothing and exits 1 if any copy is missing or stale.
"""
import json
import sys
from pathlib import Path

FIXTURES = Path(__file__).resolve().parents[2] / "test" / "parity" / "fixtures"
LIMIT = 900_000
HEAD = "// Generated from {name} by tools/parity/to_ts.py. Do not edit.\n"


def literal(data) -> str:
    return json.dumps(data, ensure_ascii=False, indent=1)


def render(path: Path) -> dict:
    """{file name: text} for one fixture: <name>.ts, and its parts when it is too big."""
    data = json.loads(path.read_text(encoding="utf-8"))
    head = HEAD.format(name=path.name)
    whole = head + f"export default {literal(data)}\n"
    if len(whole.encode()) <= LIMIT or not isinstance(data, list):
        return {path.stem + ".ts": whole}
    parts, current, size = [], [], 0
    for item in data:
        cost = len(literal(item).encode()) + 2
        if current and size + cost > LIMIT - 1000:
            parts.append(current)
            current, size = [], 0
        current.append(item)
        size += cost
    parts.append(current)
    out = {f"{path.stem}.part{n}.ts": head + f"export default {literal(part)}\n" for n, part in enumerate(parts)}
    imports = "".join(f"import part{n} from './{path.stem}.part{n}'\n" for n in range(len(parts)))
    out[path.stem + ".ts"] = head + imports + "export default [" + ", ".join(f"...part{n}" for n in range(len(parts))) + "]\n"
    return out


def main() -> int:
    check = "--check" in sys.argv
    stale = []
    wanted = {}
    for path in sorted(FIXTURES.glob("*.json")):
        wanted.update(render(path))
    for name, text in wanted.items():
        target = FIXTURES / name
        if target.exists() and target.read_text(encoding="utf-8") == text:
            continue
        stale.append(name)
        if not check:
            target.write_text(text, encoding="utf-8")
    for leftover in FIXTURES.glob("*.part*.ts"):
        if leftover.name not in wanted:
            stale.append(leftover.name)
            if not check:
                leftover.unlink()
    if stale:
        print(("stale: " if check else "wrote: ") + ", ".join(stale))
    return 1 if check and stale else 0


if __name__ == "__main__":
    sys.exit(main())
