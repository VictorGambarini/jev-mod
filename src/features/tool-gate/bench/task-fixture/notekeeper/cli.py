"""The command line."""
import json
import os
import sys

from notekeeper.store import Store


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    store = Store(os.environ.get("NOTEKEEPER_DB", "data/dev.db"))
    if not argv:
        print("usage: notekeeper add|list|export")
        return 2
    cmd = argv[0]
    if cmd == "add":
        print(store.add(argv[1], argv[2]))
    elif cmd == "list":
        for note_id, title, body in store.notes():
            print("%d  %s  %s" % (note_id, title, body))
    elif cmd == "export":
        os.makedirs(os.path.dirname(argv[1]) or ".", exist_ok=True)
        with open(argv[1], "w") as out:
            json.dump([{"id": i, "title": t, "body": b} for i, t, b in store.notes()], out)
    else:
        print("unknown command " + cmd)
        return 2
    return 0
