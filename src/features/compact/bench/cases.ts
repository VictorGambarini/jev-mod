// Decision-level cases for /jev-mod compact: synthetic sessions, each message labelled with what
// a careful person would do with it at a compaction: keep (later work needs it: a decision, a
// constraint, an exact value, path or error, an unfinished task, background whose gist matters)
// or drop (chatter, acknowledgements, superseded attempts, repeated output, detail nothing later
// depends on). A tool call and its result share one label, as the feature judges them together.
// The last six messages are always kept by the feature, so their labels are not scored.
//
// The sessions are written here, so they are synthetic and safe to keep in results.

import type { Msg } from '../keep'

export type Gold = 'keep' | 'drop'
export type LabelledMsg = Msg & { gold: Gold }
export type Session = { id: string; about: string; messages: LabelledMsg[] }

let next = 0
const id = () => `toolu_${String(++next).padStart(4, '0')}`

/** A user message. */
export const u = (text: string, gold: Gold): LabelledMsg => ({ role: 'user', text, gold })
/** An assistant message (narration). */
export const a = (text: string, gold: Gold): LabelledMsg => ({ role: 'assistant', text, gold })
/**
 * A tool call and its result: the assistant's call (with optional narration) and the user turn
 * that carries the result, both with the pair's label.
 */
export function tool(name: string, input: Record<string, unknown>, output: string, gold: Gold, narration = '', isError = false): LabelledMsg[] {
  const tool_use_id = id()
  return [
    { role: 'assistant', text: narration, toolUses: [{ tool_use_id, tool: name, input }], gold },
    { role: 'user', text: '', toolResults: [{ tool_use_id, text: output, ...(isError ? { isError: true } : {}) }], gold },
  ]
}

export const SESSIONS: Session[] = [
  {
    id: 'retry-backoff',
    about: 'adding retries with backoff to an HTTP client, with a constraint and a superseded attempt',
    messages: [
      u('Add retries with exponential backoff to src/net/client.ts. Max 4 attempts, base delay 250 ms. Do not retry on 4xx except 429.', 'keep'),
      a('Sure, let me take a look at the client first.', 'drop'),
      ...tool('Read', { file_path: 'src/net/client.ts' }, 'export async function request(url: string, init: RequestInit) {\n  const res = await fetch(url, init)\n  if (!res.ok) throw new HttpError(res.status)\n  return res.json()\n}', 'keep'),
      a('The client throws HttpError on any non-2xx status. I will wrap the fetch in a loop.', 'drop'),
      ...tool('Edit', { file_path: 'src/net/client.ts', old_string: 'const res = await fetch(url, init)', new_string: 'for (let i = 0; i < 4; i++) { const res = await fetch(url, init) ...' }, 'The file was edited.', 'drop', 'First attempt: a plain loop.'),
      ...tool('Bash', { command: 'npx vitest run src/net' }, 'FAIL src/net/client.test.ts > retries 429\nTypeError: res is not defined\n  at request (src/net/client.ts:4:9)\nTests 1 failed | 6 passed', 'drop'),
      a('That loop scoped res wrongly. I will rewrite it with a helper instead.', 'drop'),
      ...tool('Edit', { file_path: 'src/net/client.ts', old_string: 'for (let i = 0; i < 4; i++)', new_string: 'return withRetry(() => fetch(url, init), { attempts: 4, baseMs: 250, retryOn: s => s >= 500 || s === 429 })' }, 'The file was edited.', 'keep', 'Rewriting with a withRetry helper.'),
      ...tool('Bash', { command: 'npx vitest run src/net' }, 'Test Files 1 passed (1)\nTests 7 passed (7)', 'keep'),
      u('thanks', 'drop'),
      a('You are welcome. The retry helper now lives in src/net/retry.ts.', 'keep'),
      u('Now also log each retry at debug level, with the attempt number.', 'keep'),
      a('Will do.', 'drop'),
      ...tool('Edit', { file_path: 'src/net/retry.ts', old_string: 'await sleep(delay)', new_string: 'log.debug(`retry ${attempt}`); await sleep(delay)' }, 'The file was edited.', 'keep'),
      a('Added a debug log line before each sleep.', 'keep'),
      u('Run the tests again please.', 'keep'),
    ],
  },
  {
    id: 'db-migration-enum',
    about: 'migrating a text column to a Postgres enum, with a user preference stated early and a superseded raw-SQL draft',
    messages: [
      u('Migrate users.status from a text column to a Postgres enum. I prefer reversible migrations with an explicit down() always, and never raw SQL strings inline: use the knex schema builder.', 'keep'),
      a('Okay, I will start by finding the current migration files.', 'drop'),
      ...tool('Bash', { command: 'ls db/migrations' }, '20260102_create_users.ts\n20260210_add_orders.ts', 'drop'),
      a('Looking at the users migration.', 'drop'),
      ...tool('Read', { file_path: 'db/migrations/20260102_create_users.ts' }, "export async function up(knex) {\n  await knex.schema.createTable('users', t => {\n    t.increments('id')\n    t.text('status').notNullable().defaultTo('active')\n  })\n}", 'keep'),
      a('Allowed values in the data are active, suspended and closed. I will use an enum type named user_status.', 'keep'),
      ...tool('Bash', { command: 'psql -c "select distinct status from users"' }, ' status\n-----------\n active\n Active\n suspended\n closed\n(4 rows)', 'keep'),
      a('Writing the migration now.', 'drop'),
      ...tool('Write', { file_path: 'db/migrations/20260315_user_status_enum.ts', content: "await knex.raw(`CREATE TYPE user_status AS ENUM ('active','suspended','closed')`)" }, 'File created.', 'drop', 'First draft with raw SQL.'),
      u('That is a raw SQL string. Use the schema builder, and lowercase the legacy "Active" rows first.', 'keep'),
      ...tool('Write', { file_path: 'db/migrations/20260315_user_status_enum.ts', content: "export async function up(knex) {\n  await knex('users').update({ status: 'active' }).where({ status: 'Active' })\n  await knex.schema.alterTable('users', t => { t.enu('status', ['active','suspended','closed'], { useNative: true, enumName: 'user_status' }).alter() })\n}\nexport async function down(knex) {\n  await knex.schema.alterTable('users', t => { t.text('status').alter() })\n  await knex.raw('DROP TYPE user_status')\n}" }, 'File created.', 'keep'),
      ...tool('Bash', { command: 'npx knex migrate:latest' }, 'Batch 3 run: 1 migrations\n20260315_user_status_enum.ts', 'keep'),
      a('Migration 20260315_user_status_enum ran on the dev database. The down() path is not tested yet.', 'keep'),
      u('Now test the rollback.', 'keep'),
    ],
  },
  {
    id: 'flaky-test-timeout',
    about: 'debugging a flaky test where the exact assertion error and a fixed sleep matter; a bigger sleep is abandoned for fake timers',
    messages: [
      u("The test 'syncs queue after reconnect' in test/queue.spec.ts is flaky in CI. Find out why.", 'keep'),
      a('I will run it a few times locally.', 'drop'),
      ...tool('Bash', { command: 'npx vitest run test/queue.spec.ts --repeat 20' }, "FAIL test/queue.spec.ts > syncs queue after reconnect\nAssertionError: expected 'reconnecting' to be 'connected'\n  at test/queue.spec.ts:31:24\nTests 3 failed | 17 passed", 'keep'),
      ...tool('Bash', { command: 'npx vitest run test/queue.spec.ts --repeat 20' }, "FAIL test/queue.spec.ts > syncs queue after reconnect\nAssertionError: expected 'reconnecting' to be 'connected'\nTests 2 failed | 18 passed", 'drop'),
      a('Same intermittent failure. Let me read the test.', 'drop'),
      ...tool('Read', { file_path: 'test/queue.spec.ts' }, "it('syncs queue after reconnect', async () => {\n  q.disconnect()\n  q.connect()\n  await sleep(50)\n  expect(q.state).toBe('connected')\n})", 'keep'),
      a('The test waits a fixed 50 ms, but the reconnect timer in src/queue.ts is longer, so it races.', 'keep'),
      ...tool('Grep', { pattern: 'reconnectDelay', path: 'src' }, 'src/queue.ts:12:const reconnectDelay = 100\nsrc/queue.ts:40:setTimeout(() => this.open(), reconnectDelay)', 'keep'),
      a('Maybe CI is just slow. I will try a bigger sleep.', 'drop'),
      ...tool('Edit', { file_path: 'test/queue.spec.ts', old_string: 'await sleep(50)', new_string: 'await sleep(500)' }, 'The file was edited.', 'drop'),
      u('No sleeps. Use fake timers (vi.useFakeTimers) and advance by the reconnect delay.', 'keep'),
      ...tool('Edit', { file_path: 'test/queue.spec.ts', old_string: 'await sleep(500)', new_string: 'vi.advanceTimersByTime(100)' }, 'The file was edited.', 'keep'),
      ...tool('Bash', { command: 'npx vitest run test/queue.spec.ts --repeat 50' }, 'Test Files 1 passed (1)\nTests 50 passed (50)', 'keep'),
      a('Fixed: the test now uses vi.useFakeTimers and advanceTimersByTime(100) instead of a sleep.', 'keep'),
      u('nice', 'drop'),
    ],
  },
  {
    id: 'refactor-public-api',
    about: 'splitting a large module while the public exports must stay identical; chatter and repeated git status in the middle',
    messages: [
      u("Refactor src/billing/invoice.ts, it is 600 lines. Split it into smaller modules. Don't touch the public API: the exports of src/billing/index.ts must stay identical.", 'keep'),
      a('Understood, I will start with the structure.', 'drop'),
      ...tool('Bash', { command: 'grep -n "^export" src/billing/invoice.ts' }, '12:export type Invoice = {\n40:export function createInvoice(o: Order): Invoice {\n88:export function voidInvoice(i: Invoice): Invoice {\n131:export function taxFor(i: Invoice): number {\n170:export function formatLine(l: Line): string {', 'keep'),
      a('index.ts only re-exports createInvoice, voidInvoice and the Invoice type, so taxFor and formatLine can move freely.', 'keep'),
      ...tool('Read', { file_path: 'src/billing/index.ts' }, "export { createInvoice, voidInvoice } from './invoice'\nexport type { Invoice } from './invoice'", 'keep'),
      a('Let me plan the split.', 'drop'),
      ...tool('Bash', { command: 'git status' }, 'On branch refactor/billing\nnothing to commit, working tree clean', 'drop'),
      a('Nothing to commit, good.', 'drop'),
      u('How long will this take?', 'drop'),
      a('A few more minutes.', 'drop'),
      ...tool('Write', { file_path: 'src/billing/tax.ts', content: "import type { Invoice } from './invoice'\nexport function taxFor(i: Invoice): number { return i.total * 0.15 }" }, 'File created.', 'keep'),
      a('Moved taxFor out.', 'drop'),
      ...tool('Bash', { command: 'npx tsc --noEmit' }, "src/billing/invoice.ts(41,10): error TS2304: Cannot find name 'taxFor'.", 'drop'),
      ...tool('Edit', { file_path: 'src/billing/invoice.ts', old_string: "import type { Order } from '../orders'", new_string: "import type { Order } from '../orders'\nimport { taxFor } from './tax'" }, 'The file was edited.', 'keep'),
      u('Great. Next move formatLine to src/billing/format.ts, same rules.', 'keep'),
    ],
  },
  {
    id: 'docs-style-rule',
    about: 'writing an install page under a style rule; the first draft breaks the rule and is superseded',
    messages: [
      u('Write docs/install.md for the CLI. Style rule: second person, present tense, no exclamation marks, and every command in a fenced bash block.', 'keep'),
      a('Sure thing!', 'drop'),
      ...tool('Read', { file_path: 'package.json' }, '{\n  "name": "tidy-cli",\n  "bin": { "tidy": "bin/tidy.js" },\n  "engines": { "node": ">=20" }\n}', 'keep'),
      a('The package is tidy-cli, the binary is tidy, and it needs Node 20 or newer.', 'keep'),
      ...tool('Read', { file_path: 'README.md' }, '# tidy-cli\n\nInstall with `npm i -g tidy-cli`, then run `tidy --help`.', 'keep'),
      a("I'll draft the page now.", 'drop'),
      ...tool('Write', { file_path: 'docs/install.md', content: '# Install\n\nYou will love how easy this is! Just run npm i -g tidy-cli' }, 'File created.', 'drop'),
      u('That has an exclamation mark and a bare command. Follow the style rule.', 'keep'),
      a('Sorry, fixing it.', 'drop'),
      ...tool('Write', { file_path: 'docs/install.md', content: '# Install\n\nYou need Node 20 or newer. You install the CLI with:\n\n```bash\nnpm i -g tidy-cli\n```\n\nYou check the install with:\n\n```bash\ntidy --version\n```' }, 'File created.', 'keep'),
      ...tool('Bash', { command: 'grep -n "!" docs/install.md' }, '(no output)', 'drop'),
      a('docs/install.md is written. Still to do: a Troubleshooting section.', 'keep'),
      u('Add the troubleshooting section next, same style.', 'keep'),
    ],
  },
  {
    id: 'config-port-change',
    about: 'changing a server port and TLS directory in config, with the same values reused in two other files later',
    messages: [
      u('The dev server should listen on port 8443 instead of 3000, with TLS certs in /etc/devcerts/local. Update config/server.yaml.', 'keep'),
      a('On it.', 'drop'),
      ...tool('Read', { file_path: 'config/server.yaml' }, "server:\n  port: 3000\n  tls: false\n  cert_dir: ''", 'keep'),
      ...tool('Edit', { file_path: 'config/server.yaml', old_string: "port: 3000\n  tls: false\n  cert_dir: ''", new_string: 'port: 8443\n  tls: true\n  cert_dir: /etc/devcerts/local' }, 'The file was edited.', 'keep'),
      a('Updated the yaml.', 'drop'),
      a('Let me re-read it to check the indentation.', 'drop'),
      ...tool('Read', { file_path: 'config/server.yaml' }, 'server:\n  port: 8443\n  tls: true\n  cert_dir: /etc/devcerts/local', 'drop'),
      ...tool('Bash', { command: 'grep -rn "3000" src docker-compose.yml' }, "docker-compose.yml:7:    - \"3000:3000\"\nsrc/health.ts:3:const url = 'http://localhost:3000/health'", 'keep'),
      a('Two other places hardcode 3000: docker-compose.yml line 7 and src/health.ts line 3. I will update both.', 'keep'),
      ...tool('Bash', { command: 'git status --short' }, ' M config/server.yaml', 'drop'),
      u('ok', 'drop'),
      ...tool('Edit', { file_path: 'docker-compose.yml', old_string: '"3000:3000"', new_string: '"8443:8443"' }, 'The file was edited.', 'keep'),
      a('Compose updated.', 'drop'),
      ...tool('Edit', { file_path: 'src/health.ts', old_string: "'http://localhost:3000/health'", new_string: "'https://localhost:8443/health'" }, 'The file was edited.', 'keep'),
      a('All three places now use 8443, and the certs are expected in /etc/devcerts/local.', 'keep'),
      u('Start the server and curl the health endpoint.', 'keep'),
    ],
  },
  {
    id: 'git-status-chatter',
    about: 'adding a --dry-run flag to a shell script, with many repeated git status outputs and filler',
    messages: [
      u('Add a --dry-run flag to scripts/prune.sh. It must print what it would delete and delete nothing.', 'keep'),
      a('Great, let me check the repo state first.', 'drop'),
      ...tool('Bash', { command: 'git status' }, 'On branch feat/prune\nnothing to commit, working tree clean', 'drop'),
      ...tool('Read', { file_path: 'scripts/prune.sh' }, '#!/usr/bin/env bash\nroot="$1"\nfor dir in "$root"/*; do\n  rm -rf "$dir"\ndone', 'keep'),
      a('Okay.', 'drop'),
      ...tool('Bash', { command: 'git status' }, 'On branch feat/prune\nnothing to commit, working tree clean', 'drop'),
      a('Plan: parse --dry-run at the top, then guard the rm -rf in the loop with an if.', 'keep'),
      ...tool('Edit', { file_path: 'scripts/prune.sh', old_string: 'root="$1"', new_string: 'DRY=0\nif [ "$1" = "--dry-run" ]; then DRY=1; shift; fi\nroot="$1"' }, 'The file was edited.', 'keep'),
      a('Flag parsing added at the top of prune.sh: DRY=1 when --dry-run is given.', 'keep'),
      ...tool('Bash', { command: 'git status' }, 'On branch feat/prune\nChanges not staged for commit:\n\tmodified:   scripts/prune.sh', 'drop'),
      u('Also keep the exit code 0 in dry-run mode.', 'keep'),
      ...tool('Edit', { file_path: 'scripts/prune.sh', old_string: '  rm -rf "$dir"', new_string: '  if [ "$DRY" = 1 ]; then echo "would delete $dir"; else rm -rf "$dir"; fi' }, 'The file was edited.', 'keep'),
      ...tool('Bash', { command: 'bash scripts/prune.sh --dry-run /tmp/prune-test; echo $?' }, 'would delete /tmp/prune-test/a\nwould delete /tmp/prune-test/b\n0', 'keep'),
      a('Dry run prints the would-delete lines and exits with 0.', 'keep'),
      u('Also document the flag in the --help text.', 'keep'),
    ],
  },
  {
    id: 'research-auth-finding',
    about: 'a read-only investigation across several files where only the store.ts finding matters',
    messages: [
      u("Figure out why users get logged out after 30 minutes. Read-only investigation, don't change code.", 'keep'),
      a("I'll start with the auth module.", 'drop'),
      ...tool('Read', { file_path: 'src/auth/session.ts' }, "export const cookie = { name: 'sid', maxAge: 7 * 24 * 3600 * 1000, httpOnly: true }", 'keep'),
      ...tool('Read', { file_path: 'src/auth/login.ts' }, "export async function login(u, p) {\n  const user = await users.verify(u, p)\n  return store.create(user.id)\n}", 'drop'),
      a('Nothing odd so far.', 'drop'),
      ...tool('Grep', { pattern: "'EX'|ttl|expire", path: 'src' }, "src/auth/store.ts:31:  await redis.set(key, data, 'EX', 1800)\nsrc/cache.ts:5:const TTL = 3600", 'keep'),
      a('Many matches, let me narrow down.', 'drop'),
      u('Any luck?', 'drop'),
      a('Still looking.', 'drop'),
      ...tool('Read', { file_path: 'src/auth/store.ts' }, "export async function create(id) {\n  const key = `sess:${id}`\n  await redis.set(key, data, 'EX', 1800)\n  return key\n}\nexport async function get(key) {\n  return redis.get(key)\n}", 'keep'),
      a('Finding: sessions are stored in src/auth/store.ts with a fixed 1800 s expiry set once at login; get() never extends it.', 'keep'),
      ...tool('Read', { file_path: 'src/auth/middleware.ts' }, "export async function requireAuth(req, res, next) {\n  const s = await store.get(req.cookies.sid)\n  if (!s) return res.status(401).end()\n  next()\n}", 'drop'),
      a('Middleware only reads the session.', 'drop'),
      u("Good. Write up the finding and suggest a fix, don't implement it.", 'keep'),
      a('Suggested fix: call redis.expire(key, 1800) inside get() for a sliding expiry.', 'keep'),
      u('Also check whether the refresh token path has the same issue.', 'keep'),
    ],
  },
  {
    id: 'deploy-checklist',
    about: 'a release checklist where steps 1 to 3 are done and the prod deploy is deliberately left unfinished',
    messages: [
      u("Walk me through releasing v2.4.0. Checklist: 1) bump version, 2) run migrations on staging, 3) tag, 4) deploy to prod, 5) post release notes. Do 1 to 3 now; I'll say when to do 4.", 'keep'),
      a('Starting with the version bump.', 'drop'),
      ...tool('Read', { file_path: 'package.json' }, '{\n  "name": "shipit",\n  "version": "2.3.7"\n}', 'drop'),
      ...tool('Edit', { file_path: 'package.json', old_string: '"version": "2.3.7"', new_string: '"version": "2.4.0"' }, 'The file was edited.', 'keep'),
      a('Bumped.', 'drop'),
      ...tool('Bash', { command: 'npm run migrate -- --env staging' }, 'Applied 20260401_add_audit_log', 'keep'),
      a('Staging migration applied: 20260401_add_audit_log. Prod must get the same one.', 'keep'),
      ...tool('Bash', { command: 'npm run migrate -- --env staging' }, 'No pending migrations', 'drop'),
      u('cool', 'drop'),
      a('Next the tag.', 'drop'),
      ...tool('Bash', { command: 'git tag v2.4.0' }, '', 'keep'),
      ...tool('Bash', { command: "git tag --list 'v2.4*'" }, 'v2.4.0', 'drop'),
      a('Steps 1 to 3 are done. Step 4 (prod deploy) waits for your go, and step 5 (release notes) is still open.', 'keep'),
      u('Hold the deploy. First, find who approved the audit_log migration.', 'keep'),
      a('Checking the git log.', 'drop'),
      u('Never mind, we deploy tomorrow morning.', 'keep'),
    ],
  },
  {
    id: 'abandoned-cache-approach',
    about: 'speeding up a search endpoint; an in-memory cache is tried, rejected by the user and replaced by SQL filtering',
    messages: [
      u('Speed up the search endpoint in src/api/search.ts; it takes 2 s on 10k rows. Target under 300 ms.', 'keep'),
      a('Let me profile it.', 'drop'),
      ...tool('Bash', { command: 'node --prof dist/bench-search.js && node --prof-process isolate*.log | head -8' }, 'ticks  total  name\n  1420  71.0%  Array.filter (src/api/search.ts:22)\n   210  10.5%  JSON.parse', 'keep'),
      a('Most time goes to filtering all rows in JavaScript after loading them; the filter should move into SQL.', 'keep'),
      a('Option A first: add an in-memory cache.', 'drop'),
      ...tool('Edit', { file_path: 'src/api/search.ts', old_string: 'const rows = await loadAll()', new_string: 'const rows = cache.get(q) ?? await loadAll()' }, 'The file was edited.', 'drop'),
      ...tool('Bash', { command: 'curl -s -o /dev/null -w "%{time_total}\\n" localhost:8080/search?q=a' }, '2.012\n0.004', 'drop'),
      u("A cache won't help, every query is different. Drop the cache and push the filter into SQL.", 'keep'),
      ...tool('Edit', { file_path: 'src/api/search.ts', old_string: 'cache.get(q) ?? ', new_string: '' }, 'The file was edited.', 'keep', 'Removing the cache.'),
      ...tool('Edit', { file_path: 'src/api/search.ts', old_string: 'await loadAll()', new_string: "await db.query('SELECT * FROM items WHERE title ILIKE $1 LIMIT 50', [`%${q}%`])" }, 'The file was edited.', 'keep'),
      a('Query updated.', 'drop'),
      ...tool('Bash', { command: 'curl -s -o /dev/null -w "%{time_total}\\n" localhost:8080/search?q=a' }, '0.210', 'keep'),
      a('Search now takes about 210 ms, under the 300 ms target. A trigram index on title is still unfinished.', 'keep'),
      u('Add a trigram index in a migration.', 'keep'),
    ],
  },
]
