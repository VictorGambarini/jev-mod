// Decision-level cases for find-files: a small synthetic project (a shop API, about 75 files with the
// first lines they would have), and queries in plain words with the files that implement what
// each describes (gold). A file that only tests, documents or calls the behaviour is `related`:
// the tool is asked for where the code lives, so returning it is a miss, and the fake backend
// answers "related" for it. Some queries use other words than the code does, and some describe
// code the project does not have (no gold). Written here, nothing real in it.
//
// The words secret, token, key, password and cookie are left out on purpose: a card that looks
// like it holds a secret is never sent (find-files), so such a file could not be judged.

export const ROOT = '/shop'

type Def = { header: string; defs?: string[]; imports?: string[]; body?: string[] }

const text = ({ header, defs = [], imports = [], body = [] }: Def) =>
  [`// ${header}`, '', ...imports.map(i => `import { x } from '${i}'`), '', ...defs.map(d => `export function ${d}() {\n  // ...\n}`), ...body, ''].join('\n')

const TREE: Record<string, Def> = {
  'src/auth/login.ts': { header: 'Handles the sign-in request: checks the sign-in phrase and starts a session.', defs: ['handleLogin'], imports: ['./hash', './session'], body: ['// rejects after five failed attempts'] },
  'src/auth/hash.ts': { header: 'Hashes and verifies stored sign-in phrases with argon2.', defs: ['hashPhrase', 'verifyPhrase'] },
  'src/auth/session.ts': { header: 'Server-side sessions: create one, look it up, expire it after the idle limit.', defs: ['createSession', 'lookupSession', 'expireSession'], body: ['const IDLE_MINUTES = 30'] },
  'src/auth/guard.ts': { header: 'Express middleware that rejects requests without a valid session.', defs: ['requireSession'], imports: ['./session'] },
  'src/auth/roles.ts': { header: 'Role checks: which role may do what.', defs: ['can'], body: ["export const ROLES = ['admin', 'staff', 'customer']"] },
  'src/auth/oauth/google.ts': { header: 'Sign in with Google using OpenID Connect: redirect, callback and profile.', defs: ['startGoogleSignIn', 'handleGoogleCallback'], imports: ['../session'] },
  'src/net/retry.ts': { header: 'Retries a failed call with exponential backoff and jitter.', defs: ['withBackoff'], body: ['const BASE_MS = 200', '// waits BASE_MS * 2 ** attempt, plus up to 20% jitter'] },
  'src/net/http-client.ts': { header: 'The HTTP client used for outbound calls; wraps fetch with a timeout.', defs: ['httpGet', 'httpPost'], imports: ['./retry', './timeout'] },
  'src/net/timeout.ts': { header: 'Aborts a call that takes too long.', defs: ['withTimeout'] },
  'src/net/circuit.ts': { header: 'Circuit breaker: stop calling a failing service for a while, then try one call.', defs: ['CircuitBreaker'], body: ['// opens after 5 failures in a row; half-open after 30 seconds'] },
  'src/net/rate-limit.ts': { header: 'Token bucket limiter: caps requests per client per minute.', defs: ['rateLimit'], body: ['const PER_MINUTE = 60'] },
  'src/config/load.ts': { header: 'Reads the config file and the environment into one settings object.', defs: ['loadConfig'], imports: ['./schema'] },
  'src/config/schema.ts': { header: 'The shape of the settings and their default values.', defs: ['ConfigSchema'], body: ['export const DEFAULTS = { port: 8080, logLevel: "info" }'] },
  'src/config/flags.ts': { header: 'Feature flags: on or off for everyone, for named users, or for a percentage of users.', defs: ['isEnabled'], body: ['// hashes the user id into 0-99 and compares with the rollout percentage'] },
  'src/db/connection.ts': { header: 'Opens the database connection pool.', defs: ['createPool'] },
  'src/db/migrate.ts': { header: 'Runs pending schema migrations in order and records them.', defs: ['runMigrations'], imports: ['./connection'] },
  'src/db/queries/orders.ts': { header: 'SQL for orders: insert, list by customer, update status.', defs: ['insertOrder', 'listOrders', 'setStatus'], imports: ['../connection'], body: ['// SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC'] },
  'src/db/queries/users.ts': { header: 'SQL for users: find by email, insert, update profile.', defs: ['findUser', 'insertUser'], imports: ['../connection'] },
  'src/orders/create.ts': { header: 'Creates an order from a cart: prices it, reserves stock and saves it.', defs: ['createOrder'], imports: ['./price', '../inventory/stock', '../db/queries/orders'] },
  'src/orders/price.ts': { header: 'Pricing: line totals, tax and shipping for a cart.', defs: ['priceCart'], body: ['const TAX_RATE = 0.15'] },
  'src/orders/discount.ts': { header: 'Applies coupon codes and promotions to a cart, with the stacking rules.', defs: ['applyCoupons'], body: ['// at most 50 percent off in total'] },
  'src/orders/status.ts': { header: 'Order status transitions and who may make each one.', defs: ['transition'], body: ["// paid -> shipped -> delivered; paid -> refunded"] },
  'src/orders/refund.ts': { header: 'Refunds a paid order, in whole or in part, and never more than was paid.', defs: ['refundOrder'], imports: ['../payments/provider', '../payments/ledger'] },
  'src/payments/provider.ts': { header: 'Talks to the payment provider: charge a card, refund, read a charge.', defs: ['charge', 'refundCharge', 'getCharge'], imports: ['../net/http-client'] },
  'src/payments/webhook.ts': { header: 'Receives payment provider webhooks and updates orders; events seen before are ignored.', defs: ['handleWebhook'], imports: ['../orders/status'], body: ['// the event id is unique in the processed_events table'] },
  'src/payments/ledger.ts': { header: 'Double-entry ledger of every money movement, so totals always balance.', defs: ['recordEntry', 'balanceOf'] },
  'src/inventory/stock.ts': { header: 'Stock levels: reserve for an order, release, adjust after a delivery.', defs: ['reserve', 'release', 'adjust'] },
  'src/email/send.ts': { header: 'Sends an email through the mail provider.', defs: ['sendEmail'], imports: ['../net/http-client'] },
  'src/email/templates.ts': { header: "Renders email templates in the user's language.", defs: ['renderTemplate'], imports: ['../i18n/translate'] },
  'src/jobs/queue.ts': { header: 'A background job queue on Redis: enqueue, reserve, acknowledge, retry later.', defs: ['enqueue', 'reserveJob', 'ack'] },
  'src/jobs/worker.ts': { header: 'Runs jobs from the queue, a fixed number at a time.', defs: ['startWorker'], imports: ['./queue'], body: ['const CONCURRENCY = 4'] },
  'src/jobs/scheduler.ts': { header: 'Cron-style scheduler for recurring jobs.', defs: ['schedule'], imports: ['./queue'], body: ["// schedule('0 9 * * *', 'digest')"] },
  'src/jobs/digest.ts': { header: 'Builds and sends the daily digest email of new orders.', defs: ['sendDigest'], imports: ['../email/send'] },
  'src/cache/redis.ts': { header: 'Cache helpers on Redis: get, set with a time to live, invalidate by prefix.', defs: ['cacheGet', 'cacheSet', 'invalidatePrefix'] },
  'src/cache/memo.ts': { header: 'In-process memoisation of a function result, with expiry.', defs: ['memoize'] },
  'src/search/index.ts': { header: 'Builds and queries the product search index: full-text with ranking.', defs: ['search', 'reindex'], imports: ['./tokenise'] },
  'src/search/tokenise.ts': { header: 'Splits text into search terms and strips accents.', defs: ['tokenise'] },
  'src/uploads/handler.ts': { header: 'Receives a file upload, checks its type and size, and stores it.', defs: ['handleUpload'], imports: ['./storage'], body: ['const MAX_BYTES = 10 * 1024 * 1024'] },
  'src/uploads/storage.ts': { header: 'Stores files in object storage.', defs: ['putObject', 'getObject'] },
  'src/uploads/thumbnails.ts': { header: 'Makes thumbnails of uploaded images in three sizes.', defs: ['makeThumbnail'], imports: ['sharp'] },
  'src/logging/logger.ts': { header: 'Structured logger with levels, written as JSON lines.', defs: ['logger'] },
  'src/logging/request-id.ts': { header: 'Adds a request id to each request and to every log line written while it runs.', defs: ['requestId'], imports: ['./logger'] },
  'src/metrics/counters.ts': { header: 'Counters and timers sent to the metrics server.', defs: ['incr', 'timing'] },
  'src/util/pagination.ts': { header: 'Cursor pagination helpers: encode and decode a cursor, build the next page.', defs: ['encodeCursor', 'decodeCursor', 'nextPage'] },
  'src/util/dates.ts': { header: 'Date parsing and formatting.', defs: ['parseDate', 'formatDate'] },
  'src/util/slug.ts': { header: 'Turns a title into a URL slug.', defs: ['slugify'] },
  'src/util/validate.ts': { header: 'Input validation: check a body against a shape and build the error messages.', defs: ['validate'] },
  'src/util/errors.ts': { header: 'Error classes and the HTTP status each one maps to.', defs: ['AppError', 'statusFor'] },
  'src/api/routes.ts': { header: 'Mounts every route on the app.', defs: ['mountRoutes'], imports: ['./orders', './users', './search'] },
  'src/api/orders.ts': { header: 'HTTP handlers for /orders.', defs: ['getOrders', 'postOrder'], imports: ['../orders/create', '../util/pagination'] },
  'src/api/users.ts': { header: 'HTTP handlers for /users.', defs: ['getUser', 'patchUser'] },
  'src/api/search.ts': { header: 'HTTP handler for /search.', defs: ['getSearch'], imports: ['../search/index'] },
  'src/i18n/translate.ts': { header: 'Looks up a translated string for a locale, with plural rules.', defs: ['t'], body: ['// plural categories: one, few, many, other'] },
  'src/cli/index.ts': { header: 'The command-line entry point.', defs: ['main'], imports: ['./export'] },
  'src/cli/export.ts': { header: 'The export command: writes orders as CSV or JSON.', defs: ['exportCommand'], imports: ['../export/csv'] },
  'src/export/csv.ts': { header: 'CSV writer and reader that handles quoting and embedded newlines.', defs: ['writeCsv', 'splitRows'] },
  'src/gdpr/delete-account.ts': { header: "Deletes a user's data from every store: database, search index, uploads and the analytics export.", defs: ['deleteAccount'], imports: ['../search/index', '../uploads/storage'] },
  'src/gdpr/export-data.ts': { header: "Gathers a user's data into one archive for download.", defs: ['exportData'] },
  'src/reports/sales.ts': { header: 'Sales report: totals by day, product and region.', defs: ['salesReport'], imports: ['../db/connection'] },
  'src/reports/inventory.ts': { header: 'Inventory report: low stock and slow movers.', defs: ['inventoryReport'] },
  'src/shipping/rates.ts': { header: 'Shipping rates by weight, zone and carrier.', defs: ['rateFor'] },
  'src/shipping/labels.ts': { header: 'Creates shipping labels with the carrier.', defs: ['createLabel'], imports: ['../net/http-client'] },
  'src/notifications/push.ts': { header: 'Sends mobile push notifications.', defs: ['sendPush'] },
  'src/notifications/preferences.ts': { header: 'Which notifications a user wants, by channel.', defs: ['preferencesFor'] },
  'src/admin/audit.ts': { header: 'Audit trail of administrator actions.', defs: ['audit'] },
  'src/admin/impersonate.ts': { header: 'Lets support staff view the shop as a customer, with an audit entry.', defs: ['impersonate'], imports: ['./audit', '../auth/roles'] },
  'src/health.ts': { header: 'Health and readiness endpoints.', defs: ['health', 'ready'] },
  'src/server.ts': { header: 'Starts the HTTP server.', defs: ['start'], imports: ['./api/routes', './config/load', './logging/request-id'] },
  'test/net/retry.test.ts': { header: 'Tests for withBackoff: delays double, jitter stays in range, gives up after the limit.', imports: ['../../src/net/retry'] },
  'test/net/rate-limit.test.ts': { header: 'Tests for the rate limiter.', imports: ['../../src/net/rate-limit'] },
  'test/orders/refund.test.ts': { header: 'Tests for refunds: partial, repeated and over-refund.', imports: ['../../src/orders/refund'] },
  'test/auth/session.test.ts': { header: 'Tests for sessions and idle expiry.', imports: ['../../src/auth/session'] },
  'test/search/index.test.ts': { header: 'Tests for the search index.', imports: ['../../src/search/index'] },
  'docs/retry-policy.md': { header: 'Retry policy: when we retry, how long we wait, and which calls are never retried.' },
  'docs/architecture.md': { header: 'Architecture overview: the API, the worker, the database and the queue.' },
  'docs/payments.md': { header: 'How payments, refunds and webhooks fit together.' },
  'README.md': { header: 'Shop API: setup, scripts and layout.' },
}

export const FILES: Record<string, string> = Object.fromEntries(Object.entries(TREE).map(([path, def]) => [path, text(def)]))

export type FileQuery = {
  id: string
  query: string
  /** The files that implement what it describes. Empty: the project has no such code. */
  implements: string[]
  /** Files that test, document, call or lightly touch it: not the answer. */
  related?: string[]
  /** It uses other words than the code does, or the answer is spread over two files. */
  borderline?: true
}

export const QUERIES: FileQuery[] = [
  { id: 'retry-backoff', query: 'where retries with exponential backoff are done', implements: ['src/net/retry.ts'], related: ['test/net/retry.test.ts', 'docs/retry-policy.md', 'src/net/http-client.ts'] },
  { id: 'circuit-breaker', query: 'the code that stops calling a service after repeated failures', implements: ['src/net/circuit.ts'], related: ['src/net/retry.ts'] },
  { id: 'rate-limit', query: 'how requests are limited per client per minute', implements: ['src/net/rate-limit.ts'], related: ['test/net/rate-limit.test.ts'] },
  { id: 'sign-in', query: 'where a sign-in request is checked and a session started', implements: ['src/auth/login.ts'], related: ['src/auth/session.ts', 'src/auth/hash.ts'] },
  { id: 'auth-middleware', query: 'the middleware that rejects unauthenticated requests', implements: ['src/auth/guard.ts'], related: ['src/auth/session.ts'] },
  { id: 'roles', query: 'which role is allowed to do what', implements: ['src/auth/roles.ts'], related: ['src/admin/impersonate.ts'] },
  { id: 'google-sign-in', query: 'sign in with Google', implements: ['src/auth/oauth/google.ts'], related: ['src/auth/login.ts'] },
  { id: 'hashing', query: 'how stored sign-in phrases are hashed and checked', implements: ['src/auth/hash.ts'], related: ['src/auth/login.ts'] },
  { id: 'config-read', query: 'where the config file is read', implements: ['src/config/load.ts'], related: ['src/config/schema.ts', 'src/server.ts'] },
  { id: 'config-defaults', query: 'default values for the settings', implements: ['src/config/schema.ts'], related: ['src/config/load.ts'] },
  { id: 'flags', query: 'turning a feature on for a percentage of users', implements: ['src/config/flags.ts'] },
  { id: 'migrations', query: 'running database schema migrations', implements: ['src/db/migrate.ts'], related: ['src/db/connection.ts'] },
  { id: 'order-sql', query: 'the SQL that lists a customer\'s orders', implements: ['src/db/queries/orders.ts'], related: ['src/api/orders.ts'] },
  { id: 'create-order', query: 'creating an order from a cart', implements: ['src/orders/create.ts'], related: ['src/api/orders.ts', 'src/orders/price.ts'] },
  { id: 'totals', query: 'tax and totals for a cart', implements: ['src/orders/price.ts'], related: ['src/orders/create.ts'] },
  { id: 'coupons', query: 'coupon codes and promotions', implements: ['src/orders/discount.ts'] },
  { id: 'status-changes', query: 'which order status changes are allowed', implements: ['src/orders/status.ts'], related: ['src/payments/webhook.ts'] },
  { id: 'refunds', query: 'partial refund of a paid order', implements: ['src/orders/refund.ts'], related: ['src/payments/provider.ts', 'test/orders/refund.test.ts', 'docs/payments.md'] },
  { id: 'charge-card', query: 'calling the payment provider to charge a card', implements: ['src/payments/provider.ts'], related: ['docs/payments.md', 'src/orders/refund.ts'] },
  { id: 'webhook-dupes', query: 'handling incoming payment webhooks and ignoring duplicates', implements: ['src/payments/webhook.ts'], related: ['docs/payments.md'] },
  { id: 'reserve-stock', query: 'reserving stock for an order', implements: ['src/inventory/stock.ts'], related: ['src/orders/create.ts'] },
  { id: 'send-email', query: 'sending an email', implements: ['src/email/send.ts'], related: ['src/jobs/digest.ts'] },
  { id: 'email-templates', query: 'rendering email templates in the user\'s language', implements: ['src/email/templates.ts'], related: ['src/i18n/translate.ts'] },
  { id: 'job-queue', query: 'the queue of background jobs', implements: ['src/jobs/queue.ts'], related: ['src/jobs/worker.ts'] },
  { id: 'worker', query: 'running jobs a few at a time', implements: ['src/jobs/worker.ts'], related: ['src/jobs/queue.ts'] },
  { id: 'cron', query: 'scheduling recurring cron jobs', implements: ['src/jobs/scheduler.ts'] },
  { id: 'digest', query: 'the daily digest', implements: ['src/jobs/digest.ts'], related: ['src/jobs/scheduler.ts'] },
  { id: 'cache-invalidate', query: 'cache invalidation by prefix', implements: ['src/cache/redis.ts'], related: ['src/cache/memo.ts'] },
  { id: 'memoise', query: 'remembering a function result for a while in memory', implements: ['src/cache/memo.ts'], related: ['src/cache/redis.ts'] },
  { id: 'product-search', query: 'full-text product search with ranking', implements: ['src/search/index.ts'], related: ['src/search/tokenise.ts', 'src/api/search.ts', 'test/search/index.test.ts'] },
  { id: 'search-terms', query: 'splitting text into search terms and stripping accents', implements: ['src/search/tokenise.ts'], related: ['src/search/index.ts'] },
  { id: 'upload', query: 'accepting a file upload and checking its size', implements: ['src/uploads/handler.ts'], related: ['src/uploads/storage.ts'] },
  { id: 'thumbnails', query: 'making image thumbnails', implements: ['src/uploads/thumbnails.ts'], related: ['src/uploads/handler.ts'] },
  { id: 'request-id', query: 'adding a request id to log lines', implements: ['src/logging/request-id.ts'], related: ['src/logging/logger.ts', 'src/server.ts'] },
  { id: 'pagination', query: 'cursor pagination', implements: ['src/util/pagination.ts'], related: ['src/api/orders.ts'] },
  { id: 'delete-user', query: 'deleting all of a user\'s data', implements: ['src/gdpr/delete-account.ts'], related: ['src/gdpr/export-data.ts'] },
  { id: 'csv', query: 'writing CSV with quoting and newlines inside fields', implements: ['src/export/csv.ts'], related: ['src/cli/export.ts'] },
  { id: 'plurals', query: 'plural rules for translated strings', implements: ['src/i18n/translate.ts'], related: ['src/email/templates.ts'] },
  { id: 'error-status', query: 'how errors turn into HTTP status codes', implements: ['src/util/errors.ts'] },
  // other words than the code uses, or the answer is in two files
  { id: 'flaky-dependency', query: 'where do we stop hammering a flaky dependency', implements: ['src/net/circuit.ts', 'src/net/retry.ts'], related: ['src/net/http-client.ts', 'src/net/timeout.ts'], borderline: true },
  { id: 'idle-logout', query: 'how a user gets logged out when they have been idle', implements: ['src/auth/session.ts'], related: ['test/auth/session.test.ts', 'src/auth/guard.ts'], borderline: true },
  { id: 'money-balance', query: 'making sure money never goes missing between orders and the provider', implements: ['src/payments/ledger.ts'], related: ['src/orders/refund.ts', 'src/payments/webhook.ts'], borderline: true },
  { id: 'impersonation', query: 'support staff seeing the shop as a customer', implements: ['src/admin/impersonate.ts'], related: ['src/admin/audit.ts'], borderline: true },
  { id: 'who-did-what', query: 'a record of what administrators did', implements: ['src/admin/audit.ts'], related: ['src/admin/impersonate.ts'], borderline: true },
  { id: 'carrier', query: 'getting a label from the carrier', implements: ['src/shipping/labels.ts'], related: ['src/shipping/rates.ts'], borderline: true },
  // nothing in the project does this
  { id: 'none-graphql', query: 'GraphQL subscriptions', implements: [] },
  { id: 'none-kubernetes', query: 'the Kubernetes operator that scales the workers', implements: [] },
  { id: 'none-voice', query: 'voice recognition for placing orders', implements: [], borderline: true },
]
