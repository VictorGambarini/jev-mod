# ledgerline architecture

How a subscription turns into money, and where each step lives. Last reviewed 2026-07-30.

## The flow

1. A customer subscribes to a plan (`subscriptions` row: plan, cycle start and end).
2. At each cycle start the **biller** job builds an invoice: one line for the plan, plus any
   proration line from a mid-cycle plan change, plus at most one coupon line. GST is added once,
   on the invoice's net total, after proration and discounts (`invoice.build_invoice`).
3. The **collector** charges the card on file. A cleared payment marks the invoice paid and emits
   `invoice.paid`. A failed one starts dunning.
4. **Dunning** retries on the schedule in config/billing.json (days 1, 3, 5 and 7 after the
   failure) and suspends the subscription on day 14.
5. Every night the **exporter** writes the day's invoices to CSV for Xero's import, and the
   **notifier** sends partner webhooks as events happen (docs/webhooks-contract.md).

Every amount is an int number of cents (ADR 0003). Rounding happens once per division, half up,
through `money.round_half_up`.

## Plan changes and proration

A plan change takes effect on the day it is made. The customer pays the new plan for the days
left in the cycle and gets back the old plan's price for the same days; the difference is one
invoice line on the next invoice. The cycle is the subscription's own: monthly cycles run from a
date to the same date next month, annual cycles a year, and trials end on `trial_ends`. A
downgrade gives a negative line, which reduces the next invoice; an invoice is never negative.

## Processes

| process | runs | what it does |
|---|---|---|
| api | 4 gunicorn workers behind the load balancer | customer and admin API, plan changes, refunds |
| biller | cron, 00:15 NZT | builds invoices for cycles starting today |
| collector | every 10 minutes | charges open invoices, records payments |
| dunning | hourly | retries failed payments, suspends |
| exporter | cron, 02:00 NZT | the Xero CSV |
| notifier | queue consumer, 2 replicas | partner webhooks, with retries |

Several processes create documents at once, so numbers come from the `sequences` table under a
row lock (`sequence.Sequence`), never from a counter in memory: a counter per process would hand
out the same number twice.

## Modules

- `billing/money.py`: Cents, rounding half up, allocation, formatting. Vendored into the invoicing service; frozen signatures.
- `billing/plans.py`: The plan catalogue: code, display name, price per cycle in cents, period.
- `billing/proration.py`: What a plan change mid-cycle costs or credits; produces one invoice line.
- `billing/tax.py`: GST rates per region; GST on a net amount, and the GST inside a gross amount.
- `billing/sequence.py`: Document numbers from the `sequences` table, one row lock per sequence.
- `billing/invoice.py`: Builds numbered invoices from lines; GST once on the net total; paid, void.
- `billing/discounts.py`: Coupons as one negative line before GST; never stacked.
- `billing/dunning.py`: Retry schedule for failed payments and the suspension date.
- `billing/export.py`: The finance CSV for Xero's import.
- `billing/webhooks.py`: Partner events: encoding, signing, and the SDK's verification helper.

## Tables

### customers

- id text primary key (C-nnnnn)
- name text
- region text (NZ, AU)
- email text
- created_at timestamptz
- xero_contact_id text null

### subscriptions

- id bigserial
- customer_id text
- plan_code text
- cycle_start date
- cycle_end date
- status text (active, past_due, suspended, cancelled)
- trial_ends date null

### invoices

- number text primary key
- customer_id text
- region text
- issued_on date
- net_cents bigint
- gst_cents bigint
- total_cents bigint
- status text

### invoice_lines

- invoice_number text
- position int
- description text
- amount_cents bigint

### payments

- id bigserial
- invoice_number text
- amount_cents bigint
- provider_ref text
- cleared_at timestamptz null
- failed_at timestamptz null
- failure_code text null

### sequences

- name text primary key
- last bigint

### webhook_deliveries

- event_id text
- partner text
- attempt int
- status_code int null
- sent_at timestamptz
- error text null

### coupons

- code text primary key
- percent_off int
- amount_off_cents bigint
- valid_until date null
- max_redemptions int null

## Webhooks

The notifier builds an event (`webhooks.event`), encodes it once (`webhooks.encode`: compact,
UTF-8, not ASCII-escaped), signs exactly those bytes and posts them. Nothing between encoding and
sending may touch the body. Partners check deliveries with `verify_signature` from the partner
SDK, which is generated from billing/webhooks.py, so changing that function's name or arguments
breaks every partner.

Delivery attempts are logged in `webhook_deliveries` and in the app log as `webhook.delivery`.

## Refunds

Refunds today are manual: support refunds the card in the payment provider's dashboard and
finance raises a credit note by hand in Xero. There is no credit note in ledgerline yet.

## Configuration

config/billing.json holds the regions and their GST, the invoice prefix, the dunning schedule,
and the partner endpoints with the webhook tolerance. Secrets (provider keys, partner signing
keys) are not in the repository; they come from the environment in production.

## Observability

The app log is line-oriented: `<timestamp> <level> <component> <event> key=value ...`. Every
request carries `req=<id>`. The useful events:

| event | component | means |
|---|---|---|
| invoice.built | biller | an invoice was issued |
| proration.line | api | a plan change produced a proration line |
| payment.cleared / payment.failed | collector | a charge result |
| dunning.retry / dunning.suspend | dunning | a retry or a suspension |
| webhook.delivery | notifier | one delivery attempt, with partner, event id and status |
| export.written | exporter | the nightly CSV, with its row count |

## Testing

Unit tests per module in tests/, run with `scripts/check.sh` (the whole suite) or one module at a
time with `python3 -m unittest tests.test_<module> -v`. CI runs the suite nightly on Python 3.11,
3.12 and 3.13, and on every pull request.

## Ownership

| area | team |
|---|---|
| money.py, invoice numbering | invoicing (shared with the invoicing service) |
| proration, plans, dunning | billing core |
| export | finance tooling |
| webhooks, partner SDK | integrations |
