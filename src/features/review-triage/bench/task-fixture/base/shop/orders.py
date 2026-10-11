"""Orders: create, read, pay, refund, search."""
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
