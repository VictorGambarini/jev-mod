"""Invoices: line items in, a numbered invoice with GST out.

Lines are net (GST exclusive) cents. Discounts are lines too, negative, added before GST, and a
plan change's proration line (proration.proration_line) is just another line, so GST is always
worked out once, on the invoice's net total, after proration and discounts.
"""

from dataclasses import dataclass, field
from datetime import date

from .sequence import Sequence
from .tax import gst_on

INVOICES = Sequence("invoice", "INV-")


@dataclass(frozen=True)
class LineItem:
    description: str
    amount_cents: int


@dataclass
class Invoice:
    number: str
    customer_id: str
    region: str
    issued_on: date
    lines: list[LineItem] = field(default_factory=list)
    net_cents: int = 0
    gst_cents: int = 0
    total_cents: int = 0
    status: str = "open"  # open, paid, void

    @property
    def refundable_cents(self) -> int:
        """What could still be refunded: the total, once paid."""
        return self.total_cents if self.status == "paid" else 0


def build_invoice(customer_id: str, region: str, lines: list[LineItem], issued_on: date,
                  numbers: Sequence = INVOICES) -> Invoice:
    """A numbered invoice for these lines, with GST on their net total."""
    if not lines:
        raise ValueError("an invoice needs at least one line")
    net = sum(line.amount_cents for line in lines)
    if net < 0:
        raise ValueError("an invoice cannot be negative; a refund is not an invoice")
    gst = gst_on(net, region)
    return Invoice(number=numbers.next(), customer_id=customer_id, region=region, issued_on=issued_on,
                   lines=list(lines), net_cents=net, gst_cents=gst, total_cents=net + gst)


def mark_paid(invoice: Invoice) -> Invoice:
    """The invoice, paid. Only an open invoice can be paid."""
    if invoice.status != "open":
        raise ValueError(f"{invoice.number} is {invoice.status}, not open")
    invoice.status = "paid"
    return invoice


def void(invoice: Invoice) -> Invoice:
    """The invoice, voided. A paid invoice is refunded, never voided."""
    if invoice.status == "paid":
        raise ValueError(f"{invoice.number} is paid; refund it instead")
    invoice.status = "void"
    return invoice


def summary(invoice: Invoice) -> dict:
    """The invoice as plain data (for exports and webhooks)."""
    return {
        "number": invoice.number,
        "customer_id": invoice.customer_id,
        "region": invoice.region,
        "issued_on": invoice.issued_on.isoformat(),
        "net_cents": invoice.net_cents,
        "gst_cents": invoice.gst_cents,
        "total_cents": invoice.total_cents,
        "status": invoice.status,
        "lines": [{"description": l.description, "amount_cents": l.amount_cents} for l in invoice.lines],
    }
