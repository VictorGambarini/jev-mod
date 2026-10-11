# Webhooks: the contract with partners

What partners receive from ledgerline. Partners integrate against this document and the
`verify_signature` helper in our partner SDK; changing either needs a notice period of 90 days.

## Delivery

- `POST` to the partner's endpoint (config/billing.json, `webhooks.partners`).
- Body: one event, JSON, **UTF-8, not ASCII-escaped** (names keep their macrons: `"Tāne"`, not
  `"Tāne"`), compact separators, no trailing newline.
- Proxies between us and a partner must forward the body byte for byte. A partner who
  re-serialises the JSON before checking the signature will fail the check; that is expected.
- Header `Ledgerline-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>`. The MAC covers the bytes
  `<t>.<body>` exactly as sent, keyed with the partner's signing key.
- A delivery older than the tolerance (300 seconds today) is rejected by the SDK.

## Events

| type | when | data |
|---|---|---|
| `invoice.created` | an invoice is issued | the invoice summary |
| `invoice.paid` | a payment clears | the invoice summary and `customer_name` |
| `invoice.voided` | an open invoice is voided | number, reason |
| `subscription.changed` | a plan change takes effect | old plan, new plan, proration amount |
| `subscription.suspended` | dunning suspends a subscription | customer id, invoice number |

Every event has `id` (`evt_` and 12 hex digits), `type`, `created` (unix seconds) and `data`.

## Retries

A delivery that does not get a 2xx is retried after 1, 5 and 30 minutes, then given up and logged.
Partners can replay any event from their dashboard by id.
