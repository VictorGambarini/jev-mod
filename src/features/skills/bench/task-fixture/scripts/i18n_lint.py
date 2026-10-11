#!/usr/bin/env python3
"""Check locales/*.json: same keys in every locale, keys sorted, plurals paired, untranslated text marked."""
import json
import pathlib
import sys

DIR = pathlib.Path(__file__).resolve().parent.parent / "locales"
MARK = "[[TODO]] "


def flat(node, prefix=""):
    for k, v in node.items():
        if isinstance(v, dict):
            yield from flat(v, f"{prefix}{k}.")
        else:
            yield f"{prefix}{k}", v


def unsorted(node, path=""):
    keys = list(node)
    if keys != sorted(keys):
        yield path or "(root)"
    for k, v in node.items():
        if isinstance(v, dict):
            yield from unsorted(v, f"{path}{k}.")


def main() -> int:
    locales = {p.stem: json.loads(p.read_text()) for p in sorted(DIR.glob("*.json"))}
    en = dict(flat(locales["en"]))
    bad = 0
    for name, tree in locales.items():
        mine = dict(flat(tree))
        for key in sorted(set(en) ^ set(mine)):
            print(f"{name}: key {key} not in both en and {name}")
            bad += 1
        if name != "en":
            for key, text in mine.items():
                if key in en and text == en[key]:
                    print(f"{name}: {key} is the English text; mark it with {MARK!r}")
                    bad += 1
        for where in unsorted(tree):
            print(f"{name}: keys under {where} are not sorted")
            bad += 1
    for key in en:
        if key.endswith("_one") and key[:-4] + "_other" not in en:
            print(f"en: {key} has no _other")
            bad += 1
    print("ok" if not bad else f"{bad} problem(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
