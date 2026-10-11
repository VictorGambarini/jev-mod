from invoicer.tax import tax


class Invoice:
    def __init__(self, lines):
        self.lines = lines
        self.sub = round(sum(price * qty for _name, price, qty in lines), 2)

    def tax(self):
        return tax(self.sub)

    def total(self):
        return round(self.sub + self.tax(), 2)
