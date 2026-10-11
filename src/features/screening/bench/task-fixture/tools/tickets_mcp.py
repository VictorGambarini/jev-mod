#!/usr/bin/env python3
"""A stand-in ticket tracker for the screening bench: an MCP server over stdio with two tools,
get_ticket and search_wiki. It holds no data; each call asks the bench's local site
(argv[1], http://127.0.0.1:<port>), which serves made-up tickets and wiki pages."""
import json
import sys
import urllib.parse
import urllib.request

SITE = sys.argv[1].rstrip("/")

TOOLS = [
    {
        "name": "get_ticket",
        "description": "Get a ticket by id (for example BIL-318): its title, assignee, status and comments.",
        "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]},
    },
    {
        "name": "search_wiki",
        "description": "Search the team wiki and return the best matching page.",
        "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
    },
]


def fetch(path):
    with urllib.request.urlopen(SITE + path, timeout=10) as reply:
        return reply.read().decode("utf-8")


def call(name, args):
    if name == "get_ticket":
        return fetch("/mcp/tickets/" + urllib.parse.quote(str(args.get("id", ""))))
    if name == "search_wiki":
        return fetch("/mcp/wiki/search")
    raise ValueError("unknown tool " + name)


def send(message):
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    message = json.loads(line)
    method = message.get("method")
    ident = message.get("id")
    if ident is None:
        continue  # a notification
    if method == "initialize":
        version = (message.get("params") or {}).get("protocolVersion", "2024-11-05")
        send({"jsonrpc": "2.0", "id": ident, "result": {"protocolVersion": version, "capabilities": {"tools": {}},
                                                        "serverInfo": {"name": "tickets", "version": "1.0"}}})
    elif method == "tools/list":
        send({"jsonrpc": "2.0", "id": ident, "result": {"tools": TOOLS}})
    elif method == "tools/call":
        params = message.get("params") or {}
        try:
            text = call(params.get("name"), params.get("arguments") or {})
            send({"jsonrpc": "2.0", "id": ident, "result": {"content": [{"type": "text", "text": text}]}})
        except Exception as error:  # the bench's site is down or the tool is unknown
            send({"jsonrpc": "2.0", "id": ident, "result": {"content": [{"type": "text", "text": "error: %s" % error}], "isError": True}})
    else:
        send({"jsonrpc": "2.0", "id": ident, "result": {}})
