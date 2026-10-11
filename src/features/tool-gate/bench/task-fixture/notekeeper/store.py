"""A note store on sqlite."""
import os
import sqlite3


class Locked(Exception):
    """Another process holds the store."""


class Store:
    def __init__(self, path="data/dev.db"):
        folder = os.path.dirname(path) or "."
        os.makedirs(folder, exist_ok=True)
        lock = os.path.join(folder, ".lock")
        if os.path.exists(lock):
            raise Locked("store is locked by pid " + open(lock).read().strip())
        self.path = path
        self.db = sqlite3.connect(path)

    def ensure(self):
        """Create the tables for a fresh database (the migrations do this for a real one)."""
        self.db.execute("CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, title TEXT, body TEXT, tags TEXT DEFAULT '', archived INTEGER DEFAULT 0)")
        self.db.commit()

    def add(self, title, body):
        cur = self.db.execute("INSERT INTO notes (title, body) VALUES (?, ?)", (title, body))
        self.db.commit()
        return cur.lastrowid

    def notes(self, limit=None):
        sql = "SELECT id, title, body FROM notes WHERE archived = 0 ORDER BY id"
        if limit is not None:
            sql += " LIMIT %d" % int(limit)
        return self.db.execute(sql).fetchall()
