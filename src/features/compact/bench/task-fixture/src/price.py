"""Unit prices by SKU, and the discount rules."""

PRICES = {"tea": 450, "mug": 1200, "pot": 3900, "filter": 250}


def unit_price(sku):
    price = PRICES[sku]
    if sku == "mug":
        return price - 100  # the mug promotion
    return price
