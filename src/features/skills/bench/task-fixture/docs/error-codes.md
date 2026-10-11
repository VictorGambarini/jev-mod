# Error codes

Codes are `HV-<DOMAIN>-<NNNN>`. Domains: GEN 00xx, PAY 01xx, INV 02xx.

| Code | Class | Meaning |
|---|---|---|
| HV-GEN-0001 | HarborError | Unspecified service error |
| HV-GEN-0002 | NotFound | Resource not found |
| HV-PAY-0101 | CardDeclined | The card was declined |
| HV-PAY-0102 | ChargeNotFound | No such charge |
| HV-PAY-0103 | CurrencyMismatch | Currency differs from the charge |
| HV-PAY-0104 | DuplicateCharge | Idempotency key reused with a different body |
| HV-INV-0201 | OutOfStock | Not enough stock for the line |
| HV-INV-0202 | SkuUnknown | No such SKU |
