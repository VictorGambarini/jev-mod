"""Receipts."""
import logging

from .utils import fmt_money

log = logging.getLogger(__name__)


def format_receipt(order):
    lines = [f"Order #{order['id']}", f"Total: {fmt_money(order['total_cents'])}"]
    if order["notes"]:
        lines.append(f"Note: {order['notes']}")
    return "\n".join(lines)


def send_receipt(order, mailer, to):
    """Email a receipt; a mailer failure is logged and does not undo the order."""
    try:
        mailer.send(to, f"Receipt for order #{order['id']}", format_receipt(order))
    except OSError as error:
        log.warning("receipt for order %s not sent: %s", order["id"], error)
        return False
    return True
