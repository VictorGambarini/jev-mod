// Decision-level cases for routing: a prompt, and the lane the lane policy's own definitions
// (engine/lane-policy.ts) say it belongs in (gold). The mod asks one request per prompt. Synthetic,
// written here; the gold is a judgement, and the borderline prompts (small against medium,
// medium against high) are marked so a report can be read with them in mind.
//
// `security` and `vague` are what the policy's other two questions should answer, for the fake
// backend only. A prompt whose gold is small is never security-sensitive or vague, since the
// policy would not send it there.

export type Gold = 'small' | 'medium' | 'high' | 'escalate' | 'keep_current'

export type LaneCase = {
  id: string
  prompt: string
  gold: Gold
  security?: boolean
  vague?: boolean
  /** The gold is arguable: a neighbouring lane would not be a clear mistake. */
  borderline?: true
}

export const CASES: LaneCase[] = [
  // small: mechanical, fully specified
  { id: 'typo-readme', gold: 'small', prompt: 'Fix the typo in README.md line 14: "recieve" should be "receive".' },
  { id: 'rename-var', gold: 'small', prompt: 'Rename the variable `tmp` to `buffer` in src/util/copy.ts.' },
  { id: 'one-line-fix', gold: 'small', prompt: 'In src/pager.ts the last page is off by one: change `i < total` to `i <= total` in the loop on line 52.' },
  { id: 'run-tests-status', gold: 'small', prompt: 'Run the unit tests and tell me which ones fail, nothing else.' },
  { id: 'git-branch-name', gold: 'small', prompt: 'What branch am I on, and is the working tree clean?' },
  { id: 'format-json', gold: 'small', prompt: 'Reformat config/defaults.json with two-space indentation. Do not change any values.' },
  { id: 'list-todos', gold: 'small', prompt: 'List every TODO comment in src/ with its file and line number.' },
  { id: 'summarise-file', gold: 'small', prompt: 'Give me a three-line summary of what src/lib/retry.ts does.' },
  { id: 'bump-dep', gold: 'small', prompt: 'Change the lodash version in package.json from 4.17.20 to 4.17.21. Do not run an install.' },
  { id: 'add-gitignore', gold: 'small', prompt: 'Add `.env.local` and `coverage/` to .gitignore.' },
  { id: 'swap-import', gold: 'small', prompt: 'In src/ui/Header.tsx change the import of `Logo` from "../assets/logo" to "@/assets/logo".' },
  { id: 'comment-fix', gold: 'small', prompt: 'The comment above parseDate in src/lib/date.ts says it returns a string. It returns a Date. Fix the comment.' },
  { id: 'where-defined', gold: 'small', prompt: 'Where is the function `slugify` defined?' },
  { id: 'count-lines', gold: 'small', prompt: 'How many lines of TypeScript are in src/? Just the number.' },
  { id: 'constant-change', gold: 'small', prompt: 'Set MAX_RETRIES in src/net/config.ts to 5.' },
  { id: 'lint-autofix', gold: 'small', prompt: 'Run the linter with --fix on src/components and show me what it changed.' },
  { id: 'doc-link', gold: 'small', prompt: 'The link to the contributing guide in docs/index.md is broken: it should point to ../CONTRIBUTING.md.' },
  { id: 'unused-import', gold: 'small', prompt: 'Remove the unused `useMemo` import from src/ui/List.tsx.' },
  { id: 'borderline-small-test', gold: 'small', borderline: true, prompt: 'Add a unit test for clamp() in src/util/math.ts covering a value below, inside and above the range.' },
  { id: 'borderline-small-flag', gold: 'small', borderline: true, prompt: 'Add a `--quiet` flag to the CLI in bin/tool.ts that sets log level to "error". The other flags are parsed the same way in that file.' },

  // medium: ordinary work with a clear goal
  { id: 'add-endpoint', gold: 'medium', prompt: 'Add a GET /api/users/:id/preferences endpoint that returns the user\'s saved preferences as JSON. Follow how /api/users/:id/profile is written, and add tests.' },
  { id: 'known-bug', gold: 'medium', prompt: 'The CSV export drops the last row when the file has no trailing newline. The cause is in splitRows() in src/export/csv.ts. Fix it and add a regression test.' },
  { id: 'write-tests', gold: 'medium', prompt: 'Write tests for the discount calculator in src/billing/discount.ts. Cover stacked coupons, expired coupons and the 50 percent cap.' },
  { id: 'pagination', gold: 'medium', prompt: 'Add cursor pagination to the /api/orders list: accept ?cursor and ?limit, return nextCursor, keep the response shape otherwise. Update the client in src/api/orders.ts.' },
  { id: 'form-validation', gold: 'medium', prompt: 'The signup form should validate the email format and a sign-in phrase of at least 12 characters, showing the errors under each field. Use the existing useForm hook.' },
  { id: 'migrate-test-runner', gold: 'medium', prompt: 'Convert the four test files in src/lib/__tests__ from Mocha to the Vitest syntax we use elsewhere and make sure they pass.' },
  { id: 'dark-mode-toggle', gold: 'medium', prompt: 'Add a dark mode toggle to the settings page. Persist the choice in localStorage and apply it through the existing theme tokens.' },
  { id: 'research-answer', gold: 'medium', prompt: 'Compare SQLite and Postgres for our use: about 50 writes a second, one server, backups matter. Give me a short recommendation with the main trade-offs.' },
  { id: 'refactor-function', gold: 'medium', prompt: 'processOrder() in src/orders/process.ts is 200 lines. Split it into validate, price and persist steps without changing behaviour; the existing tests must still pass.' },
  { id: 'cache-header', gold: 'medium', prompt: 'Static assets under /assets are served without cache headers. Add Cache-Control with a one-year max-age and immutable for hashed filenames only, and test it.' },
  { id: 'cli-subcommand', gold: 'medium', prompt: 'Add an `export` subcommand to the CLI that writes the project list as JSON or CSV (--format). Match the structure of the `import` subcommand.' },
  { id: 'log-context', gold: 'medium', prompt: 'Requests are hard to trace in the logs. Add a request id to every log line in the API server, generated per request and returned in an X-Request-Id header.' },
  { id: 'fix-flaky-known', gold: 'medium', prompt: 'The test "sends digest at 9am" is flaky because it uses the real clock. Switch it to the fake timers helper in test/helpers/clock.ts, as the other scheduler tests do.' },
  { id: 'docs-guide', gold: 'medium', prompt: 'Write a how-to in docs/ for adding a new plugin: the folder layout, the manifest fields and a minimal example, based on the two plugins we already have.' },
  { id: 'type-errors', gold: 'medium', prompt: 'Enabling strict mode in tsconfig.json produces about 30 errors, all in src/legacy/*.ts and all of the "implicitly any" kind. Fix them with real types.' },
  { id: 'borderline-medium-small', gold: 'medium', borderline: true, prompt: 'Add a "last updated" timestamp to the footer of every docs page, taken from the file\'s git history.' },
  { id: 'borderline-medium-high', gold: 'medium', borderline: true, prompt: 'Our webhook handler occasionally processes the same event twice. Make it idempotent using the event id; the events table already has a unique column for it.' },
  { id: 'borderline-medium-rate', gold: 'medium', borderline: true, prompt: 'Add rate limiting to the public search endpoint: 30 requests a minute per IP, returning 429 with Retry-After. Use the limiter middleware that already guards /login.' },
  { id: 'underspecified-medium', gold: 'medium', vague: true, prompt: 'Make the dashboard faster.' },
  { id: 'vague-cleanup', gold: 'medium', vague: true, borderline: true, prompt: 'Clean up the utils folder.' },

  // high: many files or systems, an unknown cause, design inside the task, expensive mistakes
  { id: 'unknown-memory-leak', gold: 'high', prompt: 'The worker process grows from 200 MB to 3 GB over a day and then gets killed. Nobody knows why. Find the leak and fix it.' },
  { id: 'cross-service-rename', gold: 'high', prompt: 'We are renaming the `account` concept to `workspace` across the API, the web app, the mobile app and the database. Plan and carry it out without breaking existing clients.' },
  { id: 'concurrency-race', gold: 'high', prompt: 'Two users editing the same document sometimes lose each other\'s changes. We use a last-write-wins save. Design and implement a fix that does not lock the document.' },
  { id: 'db-migration', gold: 'high', prompt: 'Split the 40-million-row events table into one table per tenant with zero downtime. Write the migration, the dual-write period and the backfill.' },
  { id: 'intermittent-ci', gold: 'high', prompt: 'About one CI run in ten fails with a timeout in the integration suite, but never locally and never on the same test. Work out what is going on.' },
  { id: 'new-subsystem', gold: 'high', prompt: 'Add offline support to the mobile app: queue writes while offline, sync them in order when back online, and resolve conflicts with the server. Touch whatever needs touching.' },
  { id: 'perf-regression-unknown', gold: 'high', prompt: 'Page load went from 1.2 s to 4 s sometime in the last three weeks. There are about 400 commits in that range. Find what caused it and fix it.' },
  { id: 'framework-upgrade', gold: 'high', prompt: 'Upgrade the app from React 17 to 19. It uses class components, enzyme tests and a custom router. Get the build and the test suite green.' },
  { id: 'data-model-redesign', gold: 'high', prompt: 'Pricing is hard-coded per plan in six places. Redesign it so that a plan can have per-region prices, discounts and trial rules, and move the existing plans onto it.' },
  { id: 'distributed-bug', gold: 'high', prompt: 'Orders occasionally show as paid in our system but unpaid in the payment provider\'s dashboard. It happens across the order service, the queue and the provider webhook. Trace it.' },
  { id: 'auth-session-change', gold: 'high', security: true, prompt: 'Replace our server-side login sessions with short-lived signed access credentials and long-lived renewal credentials, including logout and revocation.' },
  { id: 'payments-refund', gold: 'high', security: true, prompt: 'Add partial refunds to the checkout flow: call the payment provider, update the ledger, and send the receipt. It must be impossible to refund more than was paid.' },
  { id: 'delete-user-data', gold: 'high', security: true, prompt: 'Implement account deletion that removes a user\'s data from the main database, the search index, the backups bucket and the analytics export, as the GDPR request requires.' },
  { id: 'rotate-keys', gold: 'high', security: true, prompt: 'Rotate the signing key used for download URLs without invalidating links that are already out there.' },
  { id: 'permissions-model', gold: 'high', security: true, borderline: true, prompt: 'Add a "viewer" role that can read projects but not edit or delete them. The permission checks are scattered over the controllers.' },
  { id: 'borderline-high-medium', gold: 'high', borderline: true, prompt: 'Add support for a second language to the email templates. Templates are built in four different places and share some partials.' },
  { id: 'borderline-high-cache', gold: 'high', borderline: true, prompt: 'Add a Redis cache in front of the product catalogue queries, with invalidation when a product changes through any of the admin screens or the import job.' },

  // escalate: the strongest model from the start
  { id: 'architecture-choice', gold: 'escalate', prompt: 'We need to decide between splitting the monolith into services, a modular monolith, or moving the heavy parts to a job system. We have 12 engineers and a 2-year-old Rails codebase. Design the target architecture and the path to it.' },
  { id: 'failed-attempts', gold: 'escalate', prompt: 'Three people have tried to fix the double-billing bug and each fix made something else worse. Read the history, work out the real cause, and design the fix.' },
  { id: 'security-audit-system', gold: 'escalate', security: true, prompt: 'Audit the whole platform for ways one tenant could read another tenant\'s data: the API, the background jobs, the search index, the file store and the admin tools. Fix what you find.' },
  { id: 'data-loss-recovery', gold: 'escalate', security: true, prompt: 'A bad migration ran on production last night and overwrote the `balance` column for roughly 8,000 accounts. We have hourly snapshots and the transaction log. Design the recovery so no customer ends up with a wrong balance.' },
  { id: 'consensus-protocol', gold: 'escalate', prompt: 'Our replicated job queue loses jobs when two nodes disagree about who is leader after a network partition. Redesign the leader election and the hand-off so no job is lost or run twice.' },
  { id: 'platform-rewrite-plan', gold: 'escalate', prompt: 'Design how we move 300 customers from the old billing system to the new one over six months with no invoice ever being wrong, and write the first stage.' },
  { id: 'compiler-bug', gold: 'escalate', prompt: 'Our code generator emits wrong output for about 1 in 5,000 inputs and we cannot reproduce it on demand. Two weeks of debugging found nothing. Find it.' },
  { id: 'prod-incident-security', gold: 'escalate', security: true, prompt: 'We think an attacker got an admin token and has been using it for days. Work out what they touched, close the hole, and rotate everything that could have been exposed.' },
  { id: 'borderline-escalate-high', gold: 'escalate', borderline: true, prompt: 'Design the multi-region failover for the database and the API. We have one region today and an hour of downtime would cost us a customer.' },

  // keep_current: not work a model should start on
  { id: 'needs-decision', gold: 'keep_current', prompt: 'Should we open-source the SDK? I cannot decide, and it is mostly a question for the board.' },
  { id: 'needs-access', gold: 'keep_current', prompt: 'Log in to our AWS console and delete the unused S3 buckets. I will send you the login details later.' },
  { id: 'not-a-task', gold: 'keep_current', prompt: 'Thanks, that is all for today. Have a good evening.' },
  { id: 'needs-money', gold: 'keep_current', prompt: 'Buy the annual plan for the monitoring service once the card arrives next week.' },
  { id: 'needs-person', gold: 'keep_current', prompt: 'Ask Priya which of the two designs the customer picked, then build that one.' },
  { id: 'chatter', gold: 'keep_current', prompt: 'What do you think about the weather in Auckland compared to Wellington?' },
  { id: 'borderline-keep', gold: 'keep_current', borderline: true, prompt: 'Update the pricing page with the new prices. I will confirm what they are tomorrow.' },

  // follow-ups and terse prompts, as they arrive in a session
  { id: 'terse-continue', gold: 'small', borderline: true, prompt: 'yes, go ahead and run it' },
  { id: 'terse-undo', gold: 'small', prompt: 'undo that last change to src/index.ts' },
  { id: 'terse-explain', gold: 'small', prompt: 'what does that error mean?' },
  { id: 'terse-fix-it', gold: 'medium', borderline: true, prompt: 'fix the failing tests' },
  { id: 'multi-step-medium', gold: 'medium', prompt: 'First read the failing test, then find where the bug is, then fix it, then run the whole suite. The failing test is test/cart.test.ts "applies free shipping over 100".' },
  { id: 'long-but-small', gold: 'small', prompt: 'I would like you to open the file src/config/messages.ts, find the string that says "Sucessfully saved", and correct its spelling to "Successfully saved". Please make that single change and do not touch anything else in the file, and do not run the tests.' },
  { id: 'short-but-hard', gold: 'high', prompt: 'Why does the app deadlock under load?' },
  { id: 'short-but-escalate', gold: 'escalate', security: true, prompt: 'Make our auth bulletproof.' },
]
