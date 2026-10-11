"""Applies db/migrations/*.sql in order. --dry-run applies them to an empty in-memory database."""
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(HERE, "db", "migrations")


def main(argv):
    dry = "--dry-run" in argv
    db = sqlite3.connect(":memory:" if dry else os.path.join(HERE, "db", "app.sqlite"))
    names = sorted(n for n in os.listdir(DIR) if n.endswith(".sql"))
    applied = 0
    failed = 0
    for name in names:
        sql = open(os.path.join(DIR, name), encoding="utf-8").read()
        print(f"{'would apply' if dry else 'apply'} {name}")
        try:
            db.executescript(sql)
        except sqlite3.Error as e:
            print(f"  error: {e}")
            failed += 1
            continue
        print(f"  ok  {sql.count(';')} statements")
        applied += 1
    if failed:
        print(f"{failed} of {len(names)} migrations failed (see above)")
        return 1
    print(f"all {applied} migrations applied cleanly")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
