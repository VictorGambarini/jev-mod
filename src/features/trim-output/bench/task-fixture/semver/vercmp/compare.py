"""Compare version strings the way semver.org says: 1.0.0-alpha.2 < 1.0.0-alpha.10 < 1.0.0."""
import re

_PATTERN = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$")


def parse(version):
    m = _PATTERN.match(version)
    if not m:
        raise ValueError(f"not a version: {version!r}")
    major, minor, patch, pre = m.groups()
    return int(major), int(minor), int(patch), pre.split(".") if pre else []


def compare(a, b):
    """-1, 0 or 1."""
    ma, mb = parse(a), parse(b)
    if ma[:3] != mb[:3]:
        return -1 if ma[:3] < mb[:3] else 1
    pa, pb = ma[3], mb[3]
    if not pa and not pb:
        return 0
    if not pa:
        return 1
    if not pb:
        return -1
    for x, y in zip(pa, pb):
        if x != y:
            return -1 if x < y else 1
    return (len(pa) > len(pb)) - (len(pa) < len(pb))
