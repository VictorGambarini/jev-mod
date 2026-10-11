"""SQLite access."""
import contextlib
import sqlite3

DB_PATH = "shop.db"


def connect(path=None):
    conn = sqlite3.connect(path or DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextlib.contextmanager
def transaction(conn):
    """Commit if the block succeeds, roll back if it raises."""
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
