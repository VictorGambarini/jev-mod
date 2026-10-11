"""Prices, discounts and tax, all in integer cents."""

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
