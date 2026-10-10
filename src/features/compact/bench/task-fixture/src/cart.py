"""The cart: lines of (sku, quantity), priced by price.py."""

from price import unit_price


class Cart:
    def __init__(self):
        self.lines = []

    def add(self, sku, quantity=1):
        for line in self.lines:
            if line[0] == sku:
                line[1] += quantity
                return
        self.lines.append([sku, quantity])

    def remove(self, sku):
        self.lines = [line for line in self.lines if line[0] != sku]

    def total(self):
        return sum(unit_price(sku) * quantity for sku, quantity in self.lines)
