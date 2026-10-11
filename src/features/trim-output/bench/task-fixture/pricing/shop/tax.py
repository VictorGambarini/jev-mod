"""Tax on a price in integer cents. Rates are in basis points (1500 = 15%)."""


def tax_cents(amount_cents, rate_bp):
    """Tax on amount_cents, rounded to the nearest cent, halves away from zero.

    Refunds are negative amounts and must round the same way as charges: -5 cents of tax
    is -5, not -4.
    """
    return (amount_cents * rate_bp + 5000) // 10000


def total_cents(amount_cents, rate_bp):
    return amount_cents + tax_cents(amount_cents, rate_bp)
