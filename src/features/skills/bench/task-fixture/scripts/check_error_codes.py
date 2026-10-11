#!/usr/bin/env python3
"""Check that app/errors.py, docs/error-codes.md and the retired list agree."""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / "app" / "errors.py").read_text()
doc = (ROOT / "docs" / "error-codes.md").read_text()
retired = set(re.findall(r"HV-[A-Z]+-\d{4}", (ROOT / "docs" / "error-codes-retired.md").read_text()))
in_code = dict(re.findall(r"class (\w+)\(.*?\):\s+code = \"(HV-[A-Z]+-\d{4})\"", src))
in_doc = {m.group(2): m.group(1) for m in re.finditer(r"\| (HV-[A-Z]+-\d{4}) \| (\w+) \|", doc)}
bad = 0
for cls, code in in_code.items():
    if in_doc.get(cls) != code:
        print(f"{cls}: code {code} in errors.py, {in_doc.get(cls)} in docs/error-codes.md")
        bad += 1
    if code in retired:
        print(f"{cls}: {code} is retired and cannot be reused")
        bad += 1
for cls in set(in_doc) - set(in_code):
    print(f"{cls} is in docs/error-codes.md but not in app/errors.py")
    bad += 1
print("ok" if not bad else f"{bad} problem(s)")
sys.exit(1 if bad else 0)
