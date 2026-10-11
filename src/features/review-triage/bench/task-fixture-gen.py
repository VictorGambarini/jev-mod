#!/usr/bin/env python3
"""Writes task-fixture/: a small shop service (base/) and ten uncommitted changes to it (patches/).

    python3 task-fixture-gen.py            # rewrites task-fixture/ beside this file

The bench copies base/ to a scratch project, commits it, applies one patch and leaves it
uncommitted, then asks Claude Code to review the change. Three changes are clean (docs, a rename,
logging) and seven carry one to three real bugs among harmless edits. Where the bugs are is
written in task.ts as a line of the changed file ("needle"), never as a line number, so the patch
can change without the gold going stale. check-fixtures.ts proves every needle is found once.
"""
import os
import shutil
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "task-fixture")

BASE = {}

BASE["README.md"] = """# kauri-shop

A small order service: prices, orders, refunds and receipts. Handlers take a request dict and
return a response dict, so they run behind any web framework.

    python3 -m pytest -q
"""

BASE["CLAUDE.md"] = """# kauri-shop

## Rules
- Money is always an integer number of cents. Never use float for money.
- Never swallow an exception: catch the narrowest type and log it, or let it propagate.
- Migrations must not lose data: never drop a column that holds data without a backfill migration first.
- Every admin handler is wrapped in `@require_admin`.
- SQL always uses `?` placeholders, never string formatting.
"""

BASE["shop/__init__.py"] = ""

BASE["shop/db.py"] = '''"""SQLite access."""
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
'''

BASE["shop/utils.py"] = '''"""Small helpers."""


def fmt_money(cents):
    """12345 -> '$123.45'."""
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    return f"{sign}${cents // 100:,}.{cents % 100:02d}"


def chunks(items, size):
    """Yield lists of at most `size` items."""
    for i in range(0, len(items), size):
        yield items[i:i + size]
'''

BASE["shop/auth.py"] = '''"""Passwords and tokens."""
import functools
import hashlib
import hmac
import os
import time

SECRET = os.environ.get("SHOP_SECRET", "dev-secret").encode()
TOKEN_TTL = 3600


def hash_password(password, salt=None):
    salt = salt or os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
    return f"{salt}${digest}"


def verify_password(password, stored):
    salt, _ = stored.split("$", 1)
    return hmac.compare_digest(hash_password(password, salt), stored)


def make_token(user_id, role, now=None):
    expires = int((now or time.time()) + TOKEN_TTL)
    body = f"{user_id}:{role}:{expires}"
    sig = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
    return f"{body}:{sig}"


def verify_token(token, now=None):
    """The token's user id and role, or None if it is forged or expired."""
    try:
        user_id, role, expires, sig = token.split(":")
    except (ValueError, AttributeError):
        return None
    body = f"{user_id}:{role}:{expires}"
    good = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, good):
        return None
    if int(expires) < (now or time.time()):
        return None
    return {"user_id": int(user_id), "role": role}


def require_admin(handler):
    """Wrap a handler so only an admin token reaches it."""
    @functools.wraps(handler)
    def wrapped(request):
        who = verify_token(request.get("token"))
        if not who or who["role"] != "admin":
            return {"status": 403, "error": "admin only"}
        return handler(request)
    return wrapped
'''

BASE["shop/pricing.py"] = '''"""Prices, discounts and tax, all in integer cents."""

BULK_THRESHOLD = 10
BULK_DISCOUNT_BP = 1000  # 10%
TAX_RATE_BP = 1500  # 15% GST


def line_total(unit_cents, qty):
    return unit_cents * qty


def bulk_discount(line_cents, qty):
    """Ten or more of one item take 10% off that line."""
    if qty >= BULK_THRESHOLD:
        return line_cents * BULK_DISCOUNT_BP // 10000
    return 0


def tax_cents(amount_cents):
    """GST on an amount, rounded to the nearest cent."""
    return (amount_cents * TAX_RATE_BP + 5000) // 10000


def order_total(lines):
    """lines: [{"unit_cents": int, "qty": int}] -> subtotal, discount, tax and total."""
    subtotal = 0
    discount = 0
    for line in lines:
        cents = line_total(line["unit_cents"], line["qty"])
        subtotal += cents
        discount += bulk_discount(cents, line["qty"])
    taxable = subtotal - discount
    tax = tax_cents(taxable)
    return {"subtotal": subtotal, "discount": discount, "tax": tax, "total": taxable + tax}
'''

BASE["shop/orders.py"] = '''"""Orders: create, read, pay, refund, search."""
from .db import transaction
from .pricing import order_total


class OrderError(Exception):
    pass


def create_order(conn, user_id, lines, notes=""):
    """Create an order for `lines` ([{"sku", "unit_cents", "qty"}]) and take the stock."""
    totals = order_total(lines)
    with transaction(conn):
        cur = conn.execute(
            "INSERT INTO orders (user_id, status, total_cents, notes) VALUES (?, 'new', ?, ?)",
            (user_id, totals["total"], notes),
        )
        order_id = cur.lastrowid
        for line in lines:
            left = conn.execute("SELECT stock FROM products WHERE sku = ?", (line["sku"],)).fetchone()
            if left is None or left["stock"] < line["qty"]:
                raise OrderError(f"not enough stock for {line['sku']}")
            conn.execute("UPDATE products SET stock = stock - ? WHERE sku = ?", (line["qty"], line["sku"]))
            conn.execute(
                "INSERT INTO order_lines (order_id, sku, unit_cents, qty) VALUES (?, ?, ?, ?)",
                (order_id, line["sku"], line["unit_cents"], line["qty"]),
            )
    return order_id


def get_order(conn, order_id):
    return conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()


def mark_paid(conn, order_id):
    with transaction(conn):
        conn.execute("UPDATE orders SET status = 'paid' WHERE id = ? AND status = 'new'", (order_id,))


def restock(conn, order_id):
    for line in conn.execute("SELECT sku, qty FROM order_lines WHERE order_id = ?", (order_id,)).fetchall():
        conn.execute("UPDATE products SET stock = stock + ? WHERE sku = ?", (line["qty"], line["sku"]))


def refund_order(conn, order_id, amount_cents=None):
    """Refund a paid order, in full by default. A refund cannot be larger than the total."""
    order = get_order(conn, order_id)
    if order is None or order["status"] != "paid":
        raise OrderError("only a paid order can be refunded")
    amount_cents = order["total_cents"] if amount_cents is None else amount_cents
    if amount_cents <= 0 or amount_cents > order["total_cents"]:
        raise OrderError("refund must be between 1 cent and the order total")
    with transaction(conn):
        conn.execute("INSERT INTO refunds (order_id, amount_cents) VALUES (?, ?)", (order_id, amount_cents))
        conn.execute("UPDATE orders SET status = 'refunded' WHERE id = ?", (order_id,))
        restock(conn, order_id)
    return amount_cents


def search_orders(conn, user_id, status=None):
    sql = "SELECT * FROM orders WHERE user_id = ?"
    args = [user_id]
    if status:
        sql += " AND status = ?"
        args.append(status)
    return conn.execute(sql + " ORDER BY id DESC", args).fetchall()
'''

BASE["shop/notifications.py"] = '''"""Receipts."""
import logging

from .utils import fmt_money

log = logging.getLogger(__name__)


def format_receipt(order):
    lines = [f"Order #{order['id']}", f"Total: {fmt_money(order['total_cents'])}"]
    if order["notes"]:
        lines.append(f"Note: {order['notes']}")
    return "\\n".join(lines)


def send_receipt(order, mailer, to):
    """Email a receipt; a mailer failure is logged and does not undo the order."""
    try:
        mailer.send(to, f"Receipt for order #{order['id']}", format_receipt(order))
    except OSError as error:
        log.warning("receipt for order %s not sent: %s", order["id"], error)
        return False
    return True
'''

BASE["shop/api.py"] = '''"""Request handlers. A request is a dict; a response is a dict with a status."""
from . import orders
from .auth import require_admin, verify_token
from .db import connect
from .utils import fmt_money


def handle_get_order(request):
    who = verify_token(request.get("token"))
    if not who:
        return {"status": 401, "error": "sign in"}
    conn = connect()
    order = orders.get_order(conn, request["order_id"])
    if order is None or (order["user_id"] != who["user_id"] and who["role"] != "admin"):
        return {"status": 404, "error": "no such order"}
    return {"status": 200, "order": dict(order), "total": fmt_money(order["total_cents"])}


def handle_create_order(request):
    who = verify_token(request.get("token"))
    if not who:
        return {"status": 401, "error": "sign in"}
    conn = connect()
    try:
        order_id = orders.create_order(conn, who["user_id"], request["lines"], request.get("notes", ""))
    except orders.OrderError as error:
        return {"status": 409, "error": str(error)}
    return {"status": 201, "order_id": order_id}


@require_admin
def handle_refund(request):
    conn = connect()
    try:
        amount = orders.refund_order(conn, request["order_id"], request.get("amount_cents"))
    except orders.OrderError as error:
        return {"status": 409, "error": str(error)}
    return {"status": 200, "refunded": fmt_money(amount)}


@require_admin
def handle_list_orders(request):
    conn = connect()
    rows = orders.search_orders(conn, request["user_id"], request.get("status"))
    return {"status": 200, "orders": [dict(r) for r in rows]}
'''

BASE["migrations/001_init.sql"] = """CREATE TABLE products (sku TEXT PRIMARY KEY, name TEXT NOT NULL, stock INTEGER NOT NULL DEFAULT 0);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE order_lines (order_id INTEGER NOT NULL, sku TEXT NOT NULL, unit_cents INTEGER NOT NULL, qty INTEGER NOT NULL);
CREATE TABLE refunds (order_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL);
"""

BASE["tests/__init__.py"] = ""
BASE["tests/test_pricing.py"] = '''import unittest

from shop.pricing import bulk_discount, order_total, tax_cents


class PricingTest(unittest.TestCase):
    def test_bulk_discount_starts_at_ten(self):
        self.assertEqual(bulk_discount(1000, 9), 0)
        self.assertEqual(bulk_discount(1000, 10), 100)

    def test_tax_rounds_half_up(self):
        self.assertEqual(tax_cents(1000), 150)
        self.assertEqual(tax_cents(10), 2)

    def test_order_total(self):
        got = order_total([{"unit_cents": 500, "qty": 10}, {"unit_cents": 300, "qty": 1}])
        self.assertEqual(got, {"subtotal": 5300, "discount": 500, "tax": 720, "total": 5520})
'''

# ------------------------------------------------------------------ the changes

# Each change: edits [(file, old, new)], new files {path: text}, and a one-line note. A needle is
# in task.ts; nothing here is told to the reviewer.
CHANGES = {}

CHANGES["docs-typos"] = dict(edits=[
    ("README.md", "A small order service: prices, orders, refunds and receipts. Handlers take a request dict and\nreturn a response dict, so they run behind any web framework.",
     "A small order service: prices, orders, refunds and receipts.\n\nHandlers take a request dict and return a response dict, so they can run behind any web framework.\nAll amounts are integer cents."),
    ("shop/pricing.py", '"""Prices, discounts and tax, all in integer cents."""', '"""Prices, discounts and tax.\n\nEvery amount here is an integer number of cents."""'),
    ("shop/pricing.py", "    \"\"\"GST on an amount, rounded to the nearest cent.\"\"\"", "    \"\"\"GST on an amount in cents, rounded to the nearest cent (halves go up).\"\"\""),
    ("shop/db.py", '"""SQLite access."""', '"""SQLite access: one connection helper and a transaction context manager."""'),
    ("shop/auth.py", "    \"\"\"The token's user id and role, or None if it is forged or expired.\"\"\"", "    \"\"\"Return the token's user id and role, or None if the token is forged or has expired.\"\"\""),
    ("shop/orders.py", "    \"\"\"Refund a paid order, in full by default. A refund cannot be larger than the total.\"\"\"", "    \"\"\"Refund a paid order, in full by default.\n\n    A refund cannot be larger than the order total.\n    \"\"\""),
    ("shop/utils.py", '    """Yield lists of at most `size` items."""', '    """Yield consecutive lists of at most `size` items; the last one may be shorter."""'),
], new={}, bugs=[])

CHANGES["rename-money"] = dict(edits=[
    ("shop/utils.py", "def fmt_money(cents):", "def format_money(cents):"),
    ("shop/notifications.py", "from .utils import fmt_money", "from .utils import format_money"),
    ("shop/notifications.py", "Total: {fmt_money(order['total_cents'])}", "Total: {format_money(order['total_cents'])}"),
    ("shop/api.py", "from .utils import fmt_money", "from .utils import format_money"),
    ("shop/api.py", "\"total\": fmt_money(order[\"total_cents\"])", "\"total\": format_money(order[\"total_cents\"])"),
    ("shop/api.py", "\"refunded\": fmt_money(amount)", "\"refunded\": format_money(amount)"),
], new={}, bugs=[])

CHANGES["logging"] = dict(edits=[
    ("shop/orders.py", '"""Orders: create, read, pay, refund, search."""\nfrom .db import transaction',
     '"""Orders: create, read, pay, refund, search."""\nimport logging\n\nfrom .db import transaction'),
    ("shop/orders.py", "class OrderError(Exception):\n    pass\n", "log = logging.getLogger(__name__)\n\n\nclass OrderError(Exception):\n    pass\n"),
    ("shop/orders.py", "                (order_id, line[\"sku\"], line[\"unit_cents\"], line[\"qty\"]),\n            )\n    return order_id",
     "                (order_id, line[\"sku\"], line[\"unit_cents\"], line[\"qty\"]),\n            )\n    log.info(\"created order %s for user %s: %s lines, %s cents\", order_id, user_id, len(lines), totals[\"total\"])\n    return order_id"),
    ("shop/orders.py", "        restock(conn, order_id)\n    return amount_cents", "        restock(conn, order_id)\n    log.info(\"refunded %s cents on order %s\", amount_cents, order_id)\n    return amount_cents"),
    ("shop/api.py", "from . import orders\n", "import logging\n\nfrom . import orders\n"),
    ("shop/api.py", "from .utils import fmt_money\n", "from .utils import fmt_money\n\nlog = logging.getLogger(__name__)\n"),
    ("shop/api.py", "    except orders.OrderError as error:\n        return {\"status\": 409, \"error\": str(error)}\n    return {\"status\": 201",
     "    except orders.OrderError as error:\n        log.info(\"order for user %s refused: %s\", who[\"user_id\"], error)\n        return {\"status\": 409, \"error\": str(error)}\n    return {\"status\": 201"),
], new={}, bugs=[])

CHANGES["bulk-threshold"] = dict(edits=[
    ("shop/pricing.py", "BULK_THRESHOLD = 10\nBULK_DISCOUNT_BP = 1000  # 10%\nTAX_RATE_BP = 1500  # 15% GST",
     "BULK_THRESHOLD = 10  # items of one kind\nBULK_DISCOUNT_BP = 1000  # 10%, in basis points\nTAX_RATE_BP = 1500  # 15% GST, in basis points"),
    ("shop/pricing.py", "def line_total(unit_cents, qty):\n    return unit_cents * qty", "def line_total(unit_cents: int, qty: int) -> int:\n    return unit_cents * qty"),
    ("shop/pricing.py", "def bulk_discount(line_cents, qty):\n    \"\"\"Ten or more of one item take 10% off that line.\"\"\"\n    if qty >= BULK_THRESHOLD:\n        return line_cents * BULK_DISCOUNT_BP // 10000\n    return 0",
     "def bulk_discount(line_cents: int, qty: int) -> int:\n    \"\"\"Ten or more of one item take 10% off that line.\"\"\"\n    if qty > BULK_THRESHOLD:\n        return line_cents * BULK_DISCOUNT_BP // 10000\n    return 0"),
    ("shop/pricing.py", "    subtotal = 0\n    discount = 0\n    for line in lines:\n        cents = line_total(line[\"unit_cents\"], line[\"qty\"])\n        subtotal += cents\n        discount += bulk_discount(cents, line[\"qty\"])\n    taxable = subtotal - discount",
     "    subtotal = 0\n    discount = 0\n    for line in lines:\n        cents = line_total(line[\"unit_cents\"], line[\"qty\"])\n        subtotal += cents\n        discount += bulk_discount(cents, line[\"qty\"])\n\n    taxable = subtotal - discount"),
], new={}, bugs=[])

CHANGES["admin-export"] = dict(edits=[
    ("shop/api.py", "def handle_get_order(request):\n    who", "def handle_get_order(request):\n    \"\"\"One order, to its owner or an admin.\"\"\"\n    who"),
    ("shop/api.py", "def handle_create_order(request):\n    who", "def handle_create_order(request):\n    \"\"\"Place an order for the signed-in user.\"\"\"\n    who"),
    ("shop/api.py", "    return {\"status\": 200, \"orders\": [dict(r) for r in rows]}\n",
     "    return {\"status\": 200, \"orders\": [dict(r) for r in rows]}\n\n\ndef handle_export_orders(request):\n    \"\"\"Every order of one user as CSV lines, for the accounting export.\"\"\"\n    conn = connect()\n    rows = orders.search_orders(conn, request[\"user_id\"])\n    lines = [f\"{r['id']},{r['status']},{r['total_cents']}\" for r in rows]\n    return {\"status\": 200, \"csv\": \"\\n\".join(lines)}\n"),
], new={}, bugs=[])

CHANGES["order-search"] = dict(edits=[
    ("shop/orders.py", "def search_orders(conn, user_id, status=None):\n    sql = \"SELECT * FROM orders WHERE user_id = ?\"\n    args = [user_id]\n    if status:\n        sql += \" AND status = ?\"\n        args.append(status)\n    return conn.execute(sql + \" ORDER BY id DESC\", args).fetchall()",
     "def search_orders(conn, user_id, status=None, text=None, limit=50):\n    \"\"\"A user's orders, newest first; `text` matches the order's note.\"\"\"\n    sql = \"SELECT * FROM orders WHERE user_id = ?\"\n    args = [user_id]\n    if status:\n        sql += \" AND status = ?\"\n        args.append(status)\n    if text:\n        sql += f\" AND notes LIKE '%{text}%'\"\n    sql += \" ORDER BY id DESC LIMIT ?\"\n    args.append(limit)\n    return conn.execute(sql, args).fetchall()"),
    ("shop/api.py", "    rows = orders.search_orders(conn, request[\"user_id\"], request.get(\"status\"))", "    rows = orders.search_orders(conn, request[\"user_id\"], request.get(\"status\"), request.get(\"q\"))"),
    ("shop/utils.py", "def chunks(items, size):", "def chunks(items, size):\n    # kept for the bulk importer"),
], new={}, bugs=[])

CHANGES["partial-refund"] = dict(edits=[
    ("shop/orders.py", "def refund_order(conn, order_id, amount_cents=None):\n    \"\"\"Refund a paid order, in full by default. A refund cannot be larger than the total.\"\"\"\n    order = get_order(conn, order_id)\n    if order is None or order[\"status\"] != \"paid\":\n        raise OrderError(\"only a paid order can be refunded\")\n    amount_cents = order[\"total_cents\"] if amount_cents is None else amount_cents\n    if amount_cents <= 0 or amount_cents > order[\"total_cents\"]:\n        raise OrderError(\"refund must be between 1 cent and the order total\")\n    with transaction(conn):\n        conn.execute(\"INSERT INTO refunds (order_id, amount_cents) VALUES (?, ?)\", (order_id, amount_cents))\n        conn.execute(\"UPDATE orders SET status = 'refunded' WHERE id = ?\", (order_id,))\n        restock(conn, order_id)\n    return amount_cents",
     "def refunded_so_far(conn, order_id):\n    row = conn.execute(\"SELECT COALESCE(SUM(amount_cents), 0) AS n FROM refunds WHERE order_id = ?\", (order_id,)).fetchone()\n    return row[\"n\"]\n\n\ndef refund_order(conn, order_id, amount_cents=None):\n    \"\"\"Refund a paid order, in full by default, or part of it.\n\n    Together the refunds of an order cannot exceed its total. Only a full refund puts the\n    stock back and marks the order refunded; a partial refund leaves both alone.\n    \"\"\"\n    order = get_order(conn, order_id)\n    if order is None or order[\"status\"] != \"paid\":\n        raise OrderError(\"only a paid order can be refunded\")\n    full = amount_cents is None\n    amount_cents = order[\"total_cents\"] if full else amount_cents\n    if amount_cents <= 0 or amount_cents > order[\"total_cents\"]:\n        raise OrderError(\"refund must be between 1 cent and the order total\")\n    with transaction(conn):\n        conn.execute(\"INSERT INTO refunds (order_id, amount_cents) VALUES (?, ?)\", (order_id, amount_cents))\n        if full:\n            conn.execute(\"UPDATE orders SET status = 'refunded' WHERE id = ?\", (order_id,))\n        restock(conn, order_id)\n    return amount_cents"),
    ("shop/api.py", "    return {\"status\": 200, \"refunded\": fmt_money(amount)}", "    return {\"status\": 200, \"refunded\": fmt_money(amount), \"partial\": request.get(\"amount_cents\") is not None}"),
], new={}, bugs=[])

CHANGES["drop-notes"] = dict(edits=[
    ("shop/orders.py", "def create_order(conn, user_id, lines, notes=\"\"):\n    \"\"\"Create an order for `lines` ([{\"sku\", \"unit_cents\", \"qty\"}]) and take the stock.\"\"\"",
     "def create_order(conn, user_id, lines, notes=None):\n    \"\"\"Create an order for `lines` ([{\"sku\", \"unit_cents\", \"qty\"}]) and take the stock.\n\n    `notes` is accepted for old callers and no longer stored.\n    \"\"\""),
    ("shop/orders.py", "            \"INSERT INTO orders (user_id, status, total_cents, notes) VALUES (?, 'new', ?, ?)\",\n            (user_id, totals[\"total\"], notes),",
     "            \"INSERT INTO orders (user_id, status, total_cents) VALUES (?, 'new', ?)\",\n            (user_id, totals[\"total\"]),"),
    ("shop/api.py", "orders.create_order(conn, who[\"user_id\"], request[\"lines\"], request.get(\"notes\", \"\"))", "orders.create_order(conn, who[\"user_id\"], request[\"lines\"])"),
], new={"migrations/002_drop_order_notes.sql": "-- order notes were never used for anything\nALTER TABLE orders DROP COLUMN notes;\n"}, bugs=[])

CHANGES["float-and-swallow"] = dict(edits=[
    ("shop/pricing.py", "    \"\"\"GST on an amount, rounded to the nearest cent.\"\"\"\n    return (amount_cents * TAX_RATE_BP + 5000) // 10000",
     "    \"\"\"GST on an amount, rounded to the nearest cent.\"\"\"\n    return round(amount_cents * TAX_RATE_BP / 10000)"),
    ("shop/notifications.py", "    try:\n        mailer.send(to, f\"Receipt for order #{order['id']}\", format_receipt(order))\n    except OSError as error:\n        log.warning(\"receipt for order %s not sent: %s\", order[\"id\"], error)\n        return False\n    return True",
     "    try:\n        mailer.send(to, f\"Receipt for order #{order['id']}\", format_receipt(order))\n    except Exception:\n        return False\n    return True"),
    ("shop/notifications.py", "def format_receipt(order):\n    lines = [", "def format_receipt(order):\n    \"\"\"The receipt text: order number, total and the customer's note if there is one.\"\"\"\n    lines = ["),
], new={}, bugs=[])

CHANGES["coupons"] = dict(edits=[
    ("shop/pricing.py", "def order_total(lines):\n    \"\"\"lines: [{\"unit_cents\": int, \"qty\": int}] -> subtotal, discount, tax and total.\"\"\"",
     "def order_total(lines, coupon=None, now=None):\n    \"\"\"lines: [{\"unit_cents\": int, \"qty\": int}] -> subtotal, discount, tax and total.\n\n    A valid coupon takes its percentage off the discounted subtotal, before tax.\n    \"\"\""),
    ("shop/pricing.py", "    taxable = subtotal - discount\n    tax = tax_cents(taxable)\n    return {\"subtotal\": subtotal, \"discount\": discount, \"tax\": tax, \"total\": taxable + tax}",
     "    taxable = subtotal - discount\n    tax = tax_cents(taxable)\n    total = taxable + tax\n    if coupon and coupon_valid(coupon, now):\n        coupon_cents = total * coupon[\"percent\"] // 100\n        discount += coupon_cents\n        total -= coupon_cents\n    return {\"subtotal\": subtotal, \"discount\": discount, \"tax\": tax, \"total\": total}"),
    ("shop/pricing.py", "BULK_THRESHOLD = 10\n", "from .coupons import coupon_valid\n\nBULK_THRESHOLD = 10\n"),
    ("shop/orders.py", "def create_order(conn, user_id, lines, notes=\"\"):", "def create_order(conn, user_id, lines, notes=\"\", coupon=None):"),
    ("shop/orders.py", "    totals = order_total(lines)\n", "    totals = order_total(lines, coupon)\n"),
    ("shop/utils.py", "def fmt_money(cents):\n    \"\"\"12345 -> '$123.45'.\"\"\"", "def fmt_money(cents):\n    \"\"\"12345 -> '$123.45', -50 -> '-$0.50'.\"\"\""),
], new={"shop/coupons.py": '''"""Coupons: a percentage off an order, with an expiry time and a limit on uses."""
import time


def coupon_valid(coupon, now=None):
    """A coupon works until it expires and until it has been used `max_uses` times."""
    now = now or time.time()
    if coupon["expires"] < now:
        return True
    return coupon["uses"] < coupon["max_uses"]


def redeem(coupon):
    """Record one use of the coupon."""
    return dict(coupon)
'''}, bugs=[])

ORDER = ["docs-typos", "rename-money", "logging", "bulk-threshold", "admin-export", "order-search", "partial-refund", "drop-notes", "float-and-swallow", "coupons"]


def write_tree(root, files):
    for path, text in files.items():
        full = os.path.join(root, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(text)


def git(cwd, *args):
    return subprocess.run(["git", "-c", "user.name=gen", "-c", "user.email=gen@example.invalid", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    write_tree(os.path.join(OUT, "base"), BASE)
    os.makedirs(os.path.join(OUT, "patches"))
    for cid in ORDER:
        change = CHANGES[cid]
        with tempfile.TemporaryDirectory() as tmp:
            write_tree(tmp, BASE)
            git(tmp, "init", "-q")
            git(tmp, "add", "-A")
            git(tmp, "commit", "-q", "-m", "base")
            for path, old, new in change["edits"]:
                full = os.path.join(tmp, path)
                text = open(full, encoding="utf-8").read()
                if text.count(old) != 1:
                    raise SystemExit(f"{cid}: {path}: {text.count(old)} matches for {old[:60]!r}")
                open(full, "w", encoding="utf-8").write(text.replace(old, new))
            write_tree(tmp, change["new"])
            git(tmp, "add", "-A")
            patch = git(tmp, "diff", "--cached")
        with open(os.path.join(OUT, "patches", f"{cid}.patch"), "w", encoding="utf-8") as f:
            f.write(patch)
        print(f"{cid}: {patch.count(chr(10))} patch lines")


if __name__ == "__main__":
    main()
