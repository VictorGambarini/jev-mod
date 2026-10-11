import math

GST_RATE = 0.15


def tax(amount):
    return math.floor(amount * GST_RATE * 100) / 100


def with_tax(amount):
    return round(amount + tax(amount), 2)
