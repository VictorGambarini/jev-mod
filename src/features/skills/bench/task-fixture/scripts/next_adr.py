#!/usr/bin/env python3
"""Print the next free ADR number: above every ADR file and every number in docs/adr/RESERVED."""
import pathlib
import re

DIR = pathlib.Path(__file__).resolve().parent.parent / "docs" / "adr"
used = [int(m.group(1)) for p in DIR.glob("[0-9]*.md") if (m := re.match(r"(\d{4})-", p.name))]
used += [int(n) for n in re.findall(r"^(\d{4})\b", (DIR / "RESERVED").read_text(), re.M)] if (DIR / "RESERVED").exists() else []
print(f"{max(used, default=0) + 1:04d}")
