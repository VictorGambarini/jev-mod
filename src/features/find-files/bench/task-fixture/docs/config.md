# Configuration

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | none | Postgres connection string |
| `PORT` | 8080 | HTTP port |
| `LOG_LEVEL` | info | debug, info, warn or error |
| `TAX_RATE` | 0.15 | Fallback sales tax rate for regions without a rate of their own |
| `PAYMENT_PROVIDER_SECRET` | none | Secret for calls to the payment gateway and for verifying its webhooks |
| `WEBHOOK_SIGNING_SECRET` | none | Secret used to sign webhooks we send to customers |
| `FLAG_CASH_ROUNDING` | off | Round cash-paid NZD and AUD invoices to the nearest 5c |
