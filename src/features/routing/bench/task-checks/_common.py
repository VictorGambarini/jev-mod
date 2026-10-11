"""What every hidden check shares. A check runs with the arm's project as its working directory,
after the arm finished; the arm never sees these files. The final answer arrives on stdin."""

import os
import re
import subprocess
import sys
import unittest

sys.dont_write_bytecode = True
WORK = os.getcwd()
sys.path.insert(0, WORK)

ANSWER = sys.stdin.read() if not sys.stdin.isatty() else ""

# the price list as the fixture ships it, and GST as finance works it out
BASE = {"N": 945, "A": 655, "W": 1045, "S": 1349}
PER_HALF_KG = {"N": 118, "A": 92, "W": 137, "S": 173}


def ref_gst(cents: int) -> int:
    return (cents * 15 + 50) // 100


def cli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-B", "-m", "parcel", *args], cwd=WORK, capture_output=True, text=True, timeout=60)


def line(out: str, label: str) -> str | None:
    m = re.search(rf"^{re.escape(label)}:\s*(.+?)\s*$", out, re.M)
    return m.group(1) if m else None


def cents(text: str | None) -> int | None:
    m = re.fullmatch(r"-?\$(\d+)\.(\d\d)", (text or "").replace(",", ""))
    return int(m.group(1)) * 100 + int(m.group(2)) if m else None


def nzd(c: int) -> str:
    return f"${c // 100}.{c % 100:02d}"


def project_files(exts=(".py", ".md", ".txt")):
    """(relative path, text) for each project file, .git and caches left out."""
    for root, dirs, names in os.walk(WORK):
        dirs[:] = [d for d in dirs if d not in (".git", "__pycache__")]
        for n in names:
            if n.endswith(exts):
                p = os.path.join(root, n)
                with open(p, encoding="utf-8", errors="replace") as f:
                    yield os.path.relpath(p, WORK), f.read()


def tests_mention(pattern: str) -> bool:
    return any(path.startswith("tests" + os.sep) and re.search(pattern, text) for path, text in project_files((".py",)))


def main() -> None:
    unittest.main(argv=[sys.argv[0]], verbosity=2)
