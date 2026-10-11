"""Service errors. Each carries a stable code and an HTTP status."""
from __future__ import annotations


class HarborError(Exception):
    code = "HV-GEN-0001"
    http_status = 500


class NotFound(HarborError):
    code = "HV-GEN-0002"
    http_status = 404


class CardDeclined(HarborError):
    code = "HV-PAY-0101"
    http_status = 402


class ChargeNotFound(HarborError):
    code = "HV-PAY-0102"
    http_status = 404


class CurrencyMismatch(HarborError):
    code = "HV-PAY-0103"
    http_status = 422


class DuplicateCharge(HarborError):
    code = "HV-PAY-0104"
    http_status = 409


class OutOfStock(HarborError):
    code = "HV-INV-0201"
    http_status = 409


class SkuUnknown(HarborError):
    code = "HV-INV-0202"
    http_status = 404
