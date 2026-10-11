// Decision-level cases for review triage: a change (a git diff, as git writes it), the intent it
// was meant to serve, the project's written rules, and for each of the seven questions whether
// the honest answer is yes (gold). A case is "quick" when no question is yes: one review pass is
// enough. Synthetic, written here; the code in the diffs is made up.
//
// Labelling: a yes needs the changed lines themselves to do it. Docs, comments, formatting and
// renames change no behaviour, so "tests" is no for them; a test file in the diff covers the
// behaviour it changes. Without an intent, "scope" reads "looks unfinished or inconsistent".
// Cases marked borderline are ones a careful reviewer could label the other way.

import type { QuestionId } from '../triage'

export type TriageCase = {
  id: string
  /** What the change was meant to do, as the model would pass it. */
  intent?: string
  /** The project's CLAUDE.md, when it has one. */
  rulesFile?: string
  /** One git-diff text per file. */
  files: string[]
  /** The questions whose honest answer is yes; every other asked question is no. */
  yes: QuestionId[]
  borderline?: true
}

// ── diff builders ────────────────────────────────────────────────────────────

/** A hunk in a modified file: lines start with ' ' (context), '-' or '+'. */
const edit = (path: string, start: number, ...lines: string[]) => {
  const oldN = lines.filter(l => !l.startsWith('+')).length
  const newN = lines.filter(l => !l.startsWith('-')).length
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, `@@ -${start},${oldN} +${start},${newN} @@`, ...lines].join('\n')
}
/** A file added whole. */
const add = (path: string, ...lines: string[]) =>
  [`diff --git a/${path} b/${path}`, 'new file mode 100644', '--- /dev/null', `+++ b/${path}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map(l => `+${l}`)].join('\n')
/** A file deleted whole. */
const remove = (path: string, ...lines: string[]) =>
  [`diff --git a/${path} b/${path}`, 'deleted file mode 100644', `--- a/${path}`, '+++ /dev/null', `@@ -1,${lines.length} +0,0 @@`, ...lines.map(l => `-${l}`)].join('\n')
/** A file renamed, with no change to its lines. */
const rename = (from: string, to: string) =>
  [`diff --git a/${from} b/${to}`, 'similarity index 100%', `rename from ${from}`, `rename to ${to}`].join('\n')
const binary = (path: string) => [`diff --git a/${path} b/${path}`, `Binary files a/${path} and b/${path} differ`].join('\n')

const RULES = [
  '# Project rules',
  '- Never use console.log in src/; use the logger from src/log.ts.',
  '- Do not edit files under generated/ by hand; run `npm run gen`.',
  '- Use named exports only; no default exports.',
  '- Every behaviour change needs a test in the same commit.',
  '- Keep functions under 40 lines.',
].join('\n')

export const CASES: TriageCase[] = [
  // ── clearly quick ──
  { id: 'typo-readme', files: [edit('README.md', 12, ' ## Install', ' ', '-Run `npm instal` to get started.', '+Run `npm install` to get started.', ' ')], yes: [] },
  { id: 'comment-only', files: [edit('src/queue.ts', 30, ' export function drain(q: Queue) {', '-  // go through the items', '+  // Take each item off the queue, oldest first.', '   while (q.length) handle(q.shift()!)', ' }')], yes: [] },
  { id: 'rename-local', files: [edit('src/report.ts', 8, ' export function total(rows: Row[]) {', '-  let t = 0', '-  for (const r of rows) t += r.amount', '-  return t', '+  let sum = 0', '+  for (const r of rows) sum += r.amount', '+  return sum', ' }')], yes: [] },
  { id: 'format-only', files: [edit('src/format.ts', 1, '-const pad=(n:number)=>String(n).padStart(2,"0")', '+const pad = (n: number) => String(n).padStart(2, "0")', ' ')], yes: [] },
  { id: 'add-test-only', intent: 'add a test for slugify with unicode input', files: [add('test/slug.test.ts', "import { slugify } from '../src/slug'", "test('keeps accents out', () => {", "  expect(slugify('Crème brûlée')).toBe('creme-brulee')", '})')], yes: [] },
  { id: 'changelog-entry', files: [edit('CHANGELOG.md', 1, ' # Changelog', ' ', '+## 2.4.1', '+- Fix the empty-state message on the reports page.', ' ', ' ## 2.4.0')], yes: [] },
  { id: 'extract-helper', intent: 'pull the date formatting out of the invoice view into a helper',
    files: [edit('src/invoice.ts', 20, ' export function view(inv: Invoice) {', "-  const d = new Date(inv.at).toISOString().slice(0, 10)", '+  const d = isoDay(inv.at)', '   return { id: inv.id, date: d }', ' }'), add('src/dates.ts', 'export function isoDay(ms: number) {', '  return new Date(ms).toISOString().slice(0, 10)', '}')], yes: [] },
  { id: 'lockfile-bump', files: [edit('package-lock.json', 410, '     "node_modules/eslint": {', '-      "version": "9.4.0",', '+      "version": "9.4.1",', '       "dev": true')], yes: [], borderline: true },
  { id: 'gitignore', files: [edit('.gitignore', 3, ' node_modules/', ' dist/', '+.DS_Store')], yes: [] },
  { id: 'binary-asset', intent: 'replace the logo', files: [binary('public/logo.png')], yes: [] },
  { id: 'rename-file-only', intent: 'move the date helpers next to the other utils', files: [rename('src/dates.ts', 'src/util/dates.ts')], yes: [], borderline: true },
  { id: 'snapshot-update', intent: 'update the snapshot after the heading change', files: [edit('test/__snapshots__/home.snap', 4, ' exports[`home renders`] = `', '-<h1>Welcome</h1>', '+<h1>Welcome back</h1>', ' `;')], yes: [] },
  { id: 'fix-with-test', intent: 'fix the off-by-one in pagination', rulesFile: RULES,
    files: [edit('src/page.ts', 14, ' export function pageCount(total: number, size: number) {', '-  return Math.floor(total / size)', '+  return Math.ceil(total / size)', ' }'),
      edit('test/page.test.ts', 6, " test('a partial last page counts', () => {", '+  expect(pageCount(21, 10)).toBe(3)', ' })')], yes: [] },
  { id: 'health-endpoint', intent: 'add a /health endpoint with a test', rulesFile: RULES,
    files: [edit('src/routes.ts', 40, " app.get('/version', (_req, res) => res.json({ v: VERSION }))", "+app.get('/health', (_req, res) => res.json({ ok: true }))"),
      add('test/health.test.ts', "test('health answers ok', async () => {", "  const res = await request(app).get('/health')", '  expect(res.body).toEqual({ ok: true })', '})')], yes: [] },
  { id: 'permission-with-test', intent: 'only admins may export the audit log', rulesFile: RULES,
    files: [edit('src/audit.ts', 22, " export async function exportLog(user: User) {", '+  if (!user.roles.includes(\'admin\')) throw new Forbidden(\'admin only\')', '   return db.all(\'select * from audit\')', ' }'),
      add('test/audit.test.ts', "test('a member cannot export', async () => {", '  await expect(exportLog(member)).rejects.toThrow(Forbidden)', '})')], yes: ['security'] },
  { id: 'retry-with-test', intent: 'retry the upload on a network error', rulesFile: RULES,
    files: [edit('src/upload.ts', 9, ' export async function upload(f: File) {', '-  return put(f)', '+  for (let i = 0; ; i++) {', '+    try { return await put(f) } catch (e) { if (i >= 2 || !isNetwork(e)) throw e; await sleep(200 * 2 ** i) }', '+  }', ' }'),
      add('test/upload.test.ts', "test('retries twice then gives up', async () => {", '  failing(3)', '  await expect(upload(file)).rejects.toThrow()', '})')], yes: ['runtime'] },
  { id: 'intent-matches', intent: 'show the build number in the footer', rulesFile: RULES,
    files: [edit('src/Footer.tsx', 3, ' export function Footer() {', '-  return <footer>Acme</footer>', '+  return <footer>Acme · build {BUILD}</footer>', ' }'), edit('test/Footer.test.tsx', 5, " test('footer shows the build', () => {", '+  expect(render(<Footer />).text()).toContain(`build ${BUILD}`)', ' })')], yes: [] },

  // ── a plain bug fix, no test ──
  { id: 'fix-no-test', intent: 'fix the off-by-one in pagination',
    files: [edit('src/page.ts', 14, ' export function pageCount(total: number, size: number) {', '-  return Math.floor(total / size)', '+  return Math.ceil(total / size)', ' }')], yes: ['tests'] },
  { id: 'default-timeout-changed', intent: 'extract the fetch options into a constant',
    files: [edit('src/http.ts', 5, '-export const get = (u: string) => fetch(u, { timeout: 30000 })', '+const OPTS = { timeout: 5000 }', '+export const get = (u: string) => fetch(u, OPTS)')], yes: ['tests'], borderline: true },
  { id: 'css-color', intent: 'make the warning banner more visible', files: [edit('src/banner.css', 11, ' .warn {', '-  background: #fff3cd;', '+  background: #ffe08a;', ' }')], yes: [], borderline: true },
  { id: 'delete-test-with-code', intent: 'drop the legacy exporter',
    files: [remove('src/legacy-export.ts', 'export function legacyExport(rows: Row[]) {', "  return rows.map(r => r.join('|')).join('\\n')", '}'), remove('test/legacy-export.test.ts', "test('exports pipes', () => {", "  expect(legacyExport([['a', 'b']])).toBe('a|b')", '})'),
      edit('src/index.ts', 7, "-export { legacyExport } from './legacy-export'", ' export { exportCsv } from \'./csv\'')], yes: ['interface'] },

  // ── interfaces ──
  { id: 'response-shape', intent: 'return the user name in the profile response',
    files: [edit('src/api/profile.ts', 18, ' export async function profile(id: string) {', '   const u = await users.get(id)', '-  return { id: u.id, name: u.name }', '+  return { id: u.id, displayName: u.name }', ' }')], yes: ['interface', 'tests'] },
  { id: 'rename-export', intent: 'rename parseCfg to parseConfig',
    files: [edit('src/config.ts', 6, '-export function parseCfg(text: string) {', '+export function parseConfig(text: string) {', '   return JSON.parse(text)', ' }')], yes: ['interface'] },
  { id: 'cli-flag-removed', intent: 'clean up the CLI options',
    files: [edit('src/cli.ts', 25, " program.option('--out <dir>', 'output folder')", "-program.option('--quiet', 'print nothing')", " program.option('--json', 'machine output')"), edit('src/run.ts', 11, '-  if (opts.quiet) return', '   print(result)')], yes: ['interface', 'tests'] },
  { id: 'config-key-renamed', intent: 'rename the maxRetries setting',
    files: [edit('src/settings.ts', 14, '-  maxRetries: z.number().default(3),', '+  retries: z.number().default(3),', ' '), edit('src/client.ts', 30, '-  for (let i = 0; i < cfg.maxRetries; i++) {', '+  for (let i = 0; i < cfg.retries; i++) {')], yes: ['interface', 'tests'] },
  { id: 'env-default-changed', intent: 'raise the default page size',
    files: [edit('src/env.ts', 4, "-export const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? '20')", "+export const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? '100')")], yes: ['interface', 'tests'], borderline: true },

  // ── security ──
  { id: 'auth-check-removed', intent: 'speed up the admin page',
    files: [edit('src/admin.ts', 16, ' export async function adminPage(req: Req) {', '-  if (!req.user?.isAdmin) return forbidden()', '   return render(await loadStats())', ' }')], yes: ['security', 'tests'] },
  { id: 'tls-verify-off', intent: 'make the staging import work',
    files: [edit('src/import.ts', 9, ' const agent = new https.Agent({', '-  rejectUnauthorized: true,', '+  rejectUnauthorized: false,', ' })')], yes: ['security', 'tests'] },
  { id: 'ci-write-all', intent: 'let the release job push tags',
    files: [edit('.github/workflows/release.yml', 6, ' jobs:', '   release:', '+    permissions: write-all', '     runs-on: ubuntu-latest')], yes: ['security'] },
  { id: 'log-user-email', intent: 'log failed sign-ins to debug the lockout reports',
    files: [edit('src/signin.ts', 33, '   if (!ok) {', '+    logger.warn(`failed sign-in for ${user.email} from ${req.ip}`)', '     return fail(401)', '   }')], yes: ['security', 'tests'], borderline: true },
  { id: 'rate-limit-raised', intent: 'stop customers hitting the login limit',
    files: [edit('src/limits.ts', 2, '-export const LOGIN_PER_MINUTE = 5', '+export const LOGIN_PER_MINUTE = 60')], yes: ['security', 'tests'], borderline: true },
  { id: 'escape-html', intent: 'escape user names in the comment list', rulesFile: RULES,
    files: [edit('src/comments.ts', 12, '-  return `<li>${c.author}: ${c.body}</li>`', '+  return `<li>${escapeHtml(c.author)}: ${escapeHtml(c.body)}</li>`'), add('test/comments.test.ts', "test('escapes markup', () => {", "  expect(item({ author: '<b>', body: 'x' })).not.toContain('<b>')", '})')], yes: ['security'] },

  // ── data ──
  { id: 'drop-column', intent: 'remove the unused nickname column',
    files: [add('db/migrations/0042_drop_nickname.sql', 'ALTER TABLE users DROP COLUMN nickname;'), edit('src/models/user.ts', 9, '   email: string', '-  nickname: string | null', ' }')], yes: ['data', 'tests'] },
  { id: 'add-nullable-column', intent: 'store a phone number for each user',
    files: [add('db/migrations/0043_phone.sql', 'ALTER TABLE users ADD COLUMN phone TEXT NULL;'), edit('src/models/user.ts', 9, '   email: string', '+  phone: string | null', ' }')], yes: ['data', 'tests'] },
  { id: 'cleanup-job-deletes', intent: 'delete old exports nightly',
    files: [add('src/jobs/cleanup.ts', "import { db } from '../db'", 'export async function cleanup() {', "  await db.run(\"delete from exports where created < now() - interval '30 days'\")", '}')], yes: ['data', 'runtime', 'tests'], borderline: true },
  { id: 'cache-file-format', intent: 'make the cache file smaller',
    files: [edit('src/cache.ts', 20, ' export function save(path: string, data: Entry[]) {', '-  fs.writeFileSync(path, JSON.stringify(data))', '+  fs.writeFileSync(path, encode(data))', ' }'), edit('src/cache.ts', 28, ' export function load(path: string): Entry[] {', '-  return JSON.parse(fs.readFileSync(path, \'utf8\'))', '+  return decode(fs.readFileSync(path))', ' }')], yes: ['data', 'interface', 'tests'] },

  // ── runtime ──
  { id: 'mutex-counter', intent: 'stop the counter losing updates',
    files: [edit('src/counter.ts', 5, ' export async function bump() {', '+  const release = await lock.acquire()', '+  try {', '     const n = await read()', '     await write(n + 1)', '+  } finally { release() }', ' }')], yes: ['runtime', 'tests'] },
  { id: 'swallowed-error', intent: 'stop the worker crashing on a bad message',
    files: [edit('src/worker.ts', 18, '   try {', '     await process(msg)', '-  } catch (e) { log.error(e); throw e }', '+  } catch { /* ignore */ }')], yes: ['runtime', 'tests'] },
  { id: 'memoize', intent: 'cache the price lookups',
    files: [edit('src/price.ts', 3, '-export async function price(sku: string) {', '+const seen = new Map<string, number>()', '+export async function price(sku: string) {', '+  if (seen.has(sku)) return seen.get(sku)!', '   const p = await fetchPrice(sku)', '+  seen.set(sku, p)', '   return p', ' }')], yes: ['runtime', 'tests'] },
  { id: 'parallelise-loop', intent: 'speed up the nightly sync',
    files: [edit('src/sync.ts', 12, ' export async function syncAll(ids: string[]) {', '-  for (const id of ids) await syncOne(id)', '+  await Promise.all(ids.map(id => syncOne(id)))', ' }')], yes: ['runtime', 'tests'] },

  // ── the project's rules ──
  { id: 'console-log-added', rulesFile: RULES, files: [edit('src/lib/parse.ts', 40, '   const tokens = lex(text)', '+  console.log(tokens)', '   return build(tokens)')], yes: ['rules', 'scope', 'tests'], borderline: true },
  { id: 'generated-file-edited', intent: 'fix the typo in the generated client', rulesFile: RULES,
    files: [edit('generated/client.ts', 100, '-export function getUsr(id: string) {', '+export function getUser(id: string) {', '   return http.get(`/users/${id}`)')], yes: ['rules', 'interface', 'tests'] },
  { id: 'default-export-added', intent: 'add a currency formatter', rulesFile: RULES,
    files: [add('src/money.ts', 'export default function money(cents: number) {', '  return (cents / 100).toFixed(2)', '}'), add('test/money.test.ts', "test('formats cents', () => {", "  expect(money(1250)).toBe('12.50')", '})')], yes: ['rules'] },
  { id: 'long-function', intent: 'handle the new refund state', rulesFile: RULES,
    files: [edit('src/order.ts', 50, ' export function next(o: Order) {', "   if (o.state === 'new') return 'paid'", "+  if (o.state === 'refund') return 'closed'", '   return o.state', ' }'), edit('test/order.test.ts', 9, " test('refund closes', () => {", "+  expect(next({ state: 'refund' })).toBe('closed')", ' })')], yes: [] },
  { id: 'rule-about-process', rulesFile: RULES, intent: 'bump the retry delay',
    files: [edit('src/retry.ts', 2, '-export const DELAY_MS = 200', '+export const DELAY_MS = 500')], yes: ['rules', 'tests'], borderline: true },

  // ── scope and unfinished work ──
  { id: 'scope-creep', intent: 'fix the typo in the login error message',
    files: [edit('src/login.ts', 21, "-  return fail('Incorect password')", "+  return fail('Incorrect password')", ' }'), edit('src/login.ts', 40, ' export async function lock(user: User) {', '-  await sleep(1000)', '+  await sleep(250)', ' }')], yes: ['scope', 'runtime', 'tests'] },
  { id: 'flag-plus-refactor', intent: 'add a --verbose flag',
    files: [edit('src/cli.ts', 25, " program.option('--json', 'machine output')", "+program.option('--verbose', 'print each step')"), edit('src/run.ts', 4, '-export function run(a, b, c) {', '+export function run(options: Options, input: Input, sink: Sink) {')], yes: ['scope', 'interface', 'tests'], borderline: true },
  { id: 'todo-stub', files: [add('src/export-pdf.ts', 'export function exportPdf(doc: Doc): Buffer {', '  // TODO: render the document', "  throw new Error('not implemented')", '}')], yes: ['scope', 'tests'] },
  { id: 'half-rename', files: [edit('src/user.ts', 4, '-export type Account = { id: string }', '+export type Member = { id: string }', ' '), edit('src/billing.ts', 8, ' import type { Account } from \'./user\'', ' export const owner = (a: Account) => a.id')], yes: ['scope', 'interface', 'tests'], borderline: true },
  { id: 'debug-left-in', intent: 'add pagination to the orders list',
    files: [edit('src/orders.ts', 15, ' export async function list(page: number) {', '+  console.log("page", page)', '   return db.all(`select * from orders limit 20 offset ${page * 20}`)', ' }')], yes: ['scope', 'tests'], borderline: true },
  { id: 'dependency-added', intent: 'format dates with dayjs',
    files: [edit('package.json', 14, '   "dependencies": {', '+    "dayjs": "^1.11.10",', '     "express": "^4.19.2"'), edit('src/dates.ts', 1, '+import dayjs from \'dayjs\'', ' export const day = (ms: number) => dayjs(ms).format(\'YYYY-MM-DD\')')], yes: ['tests'], borderline: true },
]
