"""Replays a request trace (JSON lines) as a readable log: python3 tools/replay.py logs/trace.jsonl"""
import json
import sys


def main(path):
    for raw in open(path, encoding="utf-8"):
        e = json.loads(raw)
        extra = " ".join(f"{k}={v}" for k, v in e.items() if k not in ("t", "level", "msg"))
        print(f"{e['t']} {e['level']:<5} {e['msg']}" + (f" {extra}" if extra else ""))


if __name__ == "__main__":
    main(sys.argv[1])
