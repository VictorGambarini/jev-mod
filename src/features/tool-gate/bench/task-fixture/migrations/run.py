"""Applies migrations/versions/*.sql in order to the dev database (what `alembic upgrade head` runs here)."""
import glob
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.environ.get("NOTEKEEPER_DB", os.path.join(HERE, "..", "data", "dev.db"))


def main(argv):
    db = sqlite3.connect(DB)
    db.execute("CREATE TABLE IF NOT EXISTS alembic_version (rev TEXT)")
    row = db.execute("SELECT rev FROM alembic_version").fetchone()
    current = row[0] if row else "0000"
    files = sorted(glob.glob(os.path.join(HERE, "versions", "*.sql")))
    if argv[:1] == ["current"]:
        print(current)
        return 0
    if argv[:1] == ["history"]:
        for f in files:
            print(os.path.basename(f))
        return 0
    if argv[:1] != ["upgrade"]:
        print("usage: alembic upgrade head|<rev> | current | history")
        return 2
    target = argv[1] if len(argv) > 1 and argv[1] != "head" else "9999"
    for f in files:
        rev = os.path.basename(f).split("_")[0]
        if rev <= current or rev > target:
            continue
        db.executescript(open(f).read())
        db.execute("DELETE FROM alembic_version")
        db.execute("INSERT INTO alembic_version VALUES (?)", (rev,))
        db.commit()
        print("Running upgrade -> " + rev)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
