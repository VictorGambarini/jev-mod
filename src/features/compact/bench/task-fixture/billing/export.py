"""The finance export: invoices as CSV, one row each, for Xero's import."""

from .invoice import Invoice

COLUMNS = ["number", "customer_id", "customer_name", "issued_on", "net_cents", "gst_cents", "total_cents", "status"]


def row(invoice: Invoice, customer_name: str) -> list[str]:
    """One invoice's fields, in COLUMNS order."""
    return [invoice.number, invoice.customer_id, customer_name, invoice.issued_on.isoformat(),
            str(invoice.net_cents), str(invoice.gst_cents), str(invoice.total_cents), invoice.status]


def to_csv(invoices: list[tuple[Invoice, str]]) -> str:
    """The CSV text, header first."""
    out = [",".join(COLUMNS)]
    for invoice, name in invoices:
        out.append(",".join(row(invoice, name)))
    return "\n".join(out) + "\n"
