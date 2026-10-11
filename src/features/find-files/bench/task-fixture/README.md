# tillbox

Billing, orders and webhooks for the Tillbox platform. Express and Postgres, TypeScript.

## Layout

- `src/billing`: invoices, tax, proration, dunning
- `src/payments`: the payment gateway client, refunds, disputes' payment side
- `src/webhooks`: webhooks we send to customers (`dispatcher/`) and webhooks the payment provider sends us (`inbound/`)
- `src/orders`, `src/customers`, `src/subscriptions`, `src/products`, `src/plans`, ...: the domain modules
- `src/http`: routes and middleware
- `src/jobs`: scheduled jobs
- `migrations/`: SQL migrations, applied in order by `npm run migrate`
- `docs/`: runbooks and the config reference

## Running it

    cp .env.example .env
    docker compose up db -d
    npm run migrate
    npm run dev

Tests: `npm test`. They use an in-memory repository, so no database is needed.

## Configuration

See `docs/config.md`. `TAX_RATE` is the fallback sales tax rate.
