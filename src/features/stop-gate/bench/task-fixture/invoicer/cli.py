import json
import sys

from invoicer.invoice import Invoice
from invoicer.tax import tax


def report(path):
    with open(path) as f:
        data = json.load(f)
    inv = Invoice([(l["name"], l["price"], l["qty"]) for l in data["lines"]])
    print("subtotal %.2f" % inv.sub)
    print("tax      %.2f" % inv.tax())
    print("total    %.2f" % inv.total())


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv[:1] == ["report"]:
        report(argv[1])
        return 0
    if argv[:1] == ["tax"]:
        print("tax on %s = %.2f" % (argv[1], tax(float(argv[1]))))
        return 0
    print("usage: invoicer report FILE | tax AMOUNT")
    return 2
