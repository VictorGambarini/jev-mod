"""Request handlers. A request is a dict; a response is a dict with a status."""
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
