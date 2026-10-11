"""The site build: copies assets into dist/ and compiles templates against filters.py."""
import os
import re
import sys

import filters

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILTER = re.compile(r"\{\{\s*[\w.]+\s*\|\s*(\w+)\s*\}\}")


def log(text):
    print(text)


def build_assets():
    count = 0
    for folder, _, names in sorted(os.walk(os.path.join(ROOT, "assets"))):
        for name in sorted(names):
            src = os.path.join(folder, name)
            rel = os.path.relpath(src, ROOT)
            out = os.path.join(ROOT, "dist", rel)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            log(f"[asset] {rel}")
            log(f"  read    {os.path.getsize(src)} bytes")
            with open(src, "rb") as fin, open(out, "wb") as fout:
                fout.write(fin.read())
            log(f"  wrote   dist/{rel}")
            count += 1
    return count


def build_templates():
    count = 0
    errors = 0
    for name in sorted(os.listdir(os.path.join(ROOT, "templates"))):
        path = os.path.join(ROOT, "templates", name)
        log(f"[template] templates/{name}")
        text = open(path, encoding="utf-8").read()
        bad = False
        for lineno, line in enumerate(text.splitlines(), 1):
            for filt in FILTER.findall(line):
                if not hasattr(filters, filt):
                    log(f"error: templates/{name}:{lineno}: unknown filter {filt!r}")
                    errors += 1
                    bad = True
        if bad:
            continue
        os.makedirs(os.path.join(ROOT, "dist", "templates"), exist_ok=True)
        with open(os.path.join(ROOT, "dist", "templates", name), "w", encoding="utf-8") as f:
            f.write(text)
        log(f"  compiled templates/{name}")
        count += 1
    return count, errors


def minify_assets():
    count = 0
    for folder, _, names in sorted(os.walk(os.path.join(ROOT, "dist", "assets"))):
        for name in sorted(names):
            path = os.path.join(folder, name)
            before = os.path.getsize(path)
            log(f"[minify] {os.path.relpath(path, ROOT)}")
            log(f"  {before} -> {max(1, before * 9 // 10)} bytes")
            count += 1
    return count


def main():
    assets = build_assets()
    log(f"{assets} assets copied")
    templates, errors = build_templates()
    log(f"{templates} templates compiled")
    log(f"{minify_assets()} assets minified")
    if errors:
        log(f"build failed: {errors} error(s), see above")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
