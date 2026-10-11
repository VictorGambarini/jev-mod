// Checks the task bench against the real fixture on disk (the plugin's tests cannot read files):
//   bun src/features/skills/bench/task.check.ts
// For each case: the untouched project fails, a session that did the task right scores 1, and
// the natural output without the skill fails the check that skill exists for.

import { fs, proc, repoRoot, run, say } from '../../../bench/node'
import { checkTask, failedRequests, FIXTURE, TASKS, type SkillTask } from './task-checks'
import { workOf } from './task'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** The tiny assertions this script needs; a failed one throws. */
const assert = {
  ok(v: unknown, why = 'not ok') { if (!v) throw new Error(why) },
  equal(a: unknown, b: unknown, why = '') { if (a !== b) throw new Error(`${why}: ${String(a)} !== ${String(b)}`) },
  deepEqual(a: unknown, b: unknown, why = '') { if (!same(a, b)) throw new Error(`${why}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`) },
  match(a: string, re: RegExp, why = '') { if (!re.test(a)) throw new Error(`${why}: ${a.slice(0, 80)} does not match ${re}`) },
  doesNotMatch(a: string, re: RegExp, why = '') { if (re.test(a)) throw new Error(`${why}: matches ${re}`) },
}

const sh = (dir: string, text: string) => run('sh', ['-c', text], { cwd: dir, timeoutMs: 30_000 })

async function copyOfFixture(): Promise<string> {
  const f = await fs()
  const dir = await f.mkdtemp('/tmp/jev-skills-task-check-')
  await f.cp(`${repoRoot()}/${FIXTURE}`, dir, { recursive: true })
  return dir
}
async function write(dir: string, path: string, text: string) {
  const f = await fs()
  await f.mkdir(`${dir}/${path.split('/').slice(0, -1).join('/') || '.'}`, { recursive: true })
  await f.writeFile(`${dir}/${path}`, text)
}
const get = (id: string): SkillTask => TASKS.find(t => t.id === id)!

// What a session that followed the right skill leaves behind, and what it answers.
const SOLUTIONS: Record<string, (dir: string) => Promise<string>> = {
  async 'changelog-default'(dir) {
    const text = await workOf(dir).read('CHANGELOG.md')
    await write(dir, 'CHANGELOG.md', text.replace('### Operator notes\n\n', '### Operator notes\n* **webhooks** — the default retry limit is 5 (was 3) (#482)\n\n'))
    return 'Added.'
  },
  async 'adr-queue'(dir) {
    await write(dir, 'docs/adr/0010-job-queue-sqs.md', '# ADR-0010: Move the job queue to SQS\n\n- Status: Proposed\n- Deciders: platform team\n\n## Context\nx\n\n## Decision\nx\n\n## Consequences\nx\n\n## Alternatives considered\nx\n')
    const index = await workOf(dir).read('docs/adr/README.md')
    await write(dir, 'docs/adr/README.md', index.trimEnd() + '\n| 0010 | Move the job queue to SQS | Proposed |\n')
    return 'Done.'
  },
  async 'incident-payments'(dir) {
    await write(dir, 'docs/incidents/2026-10-08-checkout-gateway-pool.md', [
      '# Incident: checkout failures from gateway pool exhaustion', '**Severity:** SEV2', '', '## Summary', 'x', '', '## Impact', 'x', '',
      '## Timeline (UTC)', '- 01:40Z — deploy', '- 01:51Z — support reports', '- 01:58Z — alert fires', '- 02:05Z — oncall acks', '- 02:20Z — pool found exhausted',
      '- 02:34Z — rolled back', '- 02:38Z — recovered', '', '## Root cause', 'x', '', '## Detection', 'x', '', '## Action items',
      '| Action | Owner | Due |', '|---|---|---|', '| Alert window to 5m | Hana | 2026-10-17 |', '| Pool limit | Aroha | 2026-10-24 |', '| Canary | Tom | 2026-10-31 |', ''].join('\n'))
    return 'Done.'
  },
  async 'migration-archived'(dir) {
    await write(dir, 'migrations/0042_add_orders_archived_at.sql', '-- risk: medium\nALTER TABLE orders ADD COLUMN archived_at TIMESTAMP NULL, ALGORITHM=INPLACE, LOCK=NONE;\n')
    await write(dir, 'migrations/0042_add_orders_archived_at.down.sql', 'ALTER TABLE orders DROP COLUMN archived_at, ALGORITHM=INPLACE, LOCK=NONE;\n')
    return 'Done.'
  },
  async 'flag-bulk-refund'(dir) {
    await run('python3', ['scripts/new_flag.py', 'bulk_refund', 'payments'], { cwd: dir, timeoutMs: 30_000 })
    return 'Done.'
  },
  async 'error-refund-exceeds'(dir) {
    const w = workOf(dir)
    await write(dir, 'app/errors.py', (await w.read('app/errors.py')).replace('class OutOfStock', 'class RefundExceedsCharge(HarborError):\n    code = "HV-PAY-0107"\n    http_status = 422\n\n\nclass OutOfStock'))
    await write(dir, 'docs/error-codes.md', (await w.read('docs/error-codes.md')).replace('| HV-INV-0201', '| HV-PAY-0107 | RefundExceedsCharge | Refund is more than the charge |\n| HV-INV-0201'))
    return 'Done.'
  },
  async 'i18n-unread'(dir) {
    const w = workOf(dir)
    for (const l of ['en', 'es', 'fr']) {
      const tree = JSON.parse(await w.read(`locales/${l}.json`))
      const mark = l === 'en' ? '' : '[[TODO]] '
      tree.billing.dashboard.unread_invoices_one = `${mark}You have {count} unread invoice`
      tree.billing.dashboard.unread_invoices_other = `${mark}You have {count} unread invoices`
      tree.billing.dashboard = Object.fromEntries(Object.entries(tree.billing.dashboard).sort(([a], [b]) => (a < b ? -1 : 1)))
      await write(dir, `locales/${l}.json`, JSON.stringify(tree, null, 2) + '\n')
    }
    return 'Done.'
  },
  async 'logs-failed-orders'() { return 'There were 32 failed order requests on 8 Oct (NZ time).' },
  async 'bug-paginate'(dir) {
    await sh(dir, "sed -i 's/ + per_page + 1/ + per_page/' app/utils.py")
    return 'Fixed.'
  },
  async 'rename-parse-money'(dir) {
    await sh(dir, "sed -i 's/parse_amount/parse_money/g' app/*.py tests/*.py")
    return 'Renamed.'
  },
}

async function main() {
  const f = await fs()
  const root = `${repoRoot()}/${FIXTURE}`
  const dirs = await f.readdir(`${root}/.claude/skills`)
  assert.ok(dirs.length >= 15, 'at least 15 skills installed')
  for (const t of TASKS) if (t.skill) assert.ok(dirs.includes(t.skill), `${t.skill} is installed`)
  for (const d of dirs) assert.match(await f.readFile(`${root}/.claude/skills/${d}/SKILL.md`, 'utf8'), new RegExp(`^---\\nname: ${d}\\ndescription: .+\\n---`), `${d} front matter`)
  assert.doesNotMatch(await f.readFile(`${root}/CLAUDE.md`, 'utf8'), /Operator notes|RESERVED|\[\[TODO\]\]|ALGORITHM/, 'CLAUDE.md holds no skill convention')
  assert.equal(TASKS.length, 10)
  assert.equal(TASKS.filter(t => t.skill === null).length, 2)

  for (const t of TASKS) {
    let dir = await copyOfFixture()
    assert.equal((await checkTask(t, '', workOf(dir))).success, false, `${t.id}: untouched project fails`)
    dir = await copyOfFixture()
    const answer = await SOLUTIONS[t.id]!(dir)
    const checked = await checkTask(t, answer, workOf(dir))
    assert.deepEqual(checked.detail?.failed, [], `${t.id}: a right solution passes every check`)
    say(`ok  ${t.id}`)
  }

  // the natural output without the skill
  let dir = await copyOfFixture()
  await write(dir, 'docs/adr/0008-sqs.md', '# ADR-0008: SQS\n\n- Status: Accepted\n\n## Context\nx\n\n## Decision\nx\n\n## Consequences\nx\n')
  assert.equal((await checkTask(get('adr-queue'), '', workOf(dir))).success, false)
  dir = await copyOfFixture()
  const text = await workOf(dir).read('CHANGELOG.md')
  await write(dir, 'CHANGELOG.md', text.replace('### Changed\n', '### Changed\n* **webhooks** — retry limit 3 to 5 (#482)\n'))
  assert.ok(((await checkTask(get('changelog-default'), '', workOf(dir))).detail?.failed as string[]).includes('entry is in Operator notes'))
  dir = await copyOfFixture()
  await write(dir, 'config/flags.toml', (await workOf(dir).read('config/flags.toml')) + '\n[flags.bulk_refund]\nowner = "payments"\ndefault = false\nsunset = "2027-01-01"\n')
  assert.ok(((await checkTask(get('flag-bulk-refund'), '', workOf(dir))).detail?.failed as string[]).includes('check_flags passes'))
  dir = await copyOfFixture()
  await write(dir, 'app/errors.py', (await workOf(dir).read('app/errors.py')) + '\n\nclass RefundExceedsCharge(HarborError):\n    code = "HV-PAY-0105"\n    http_status = 422\n')
  assert.equal((await checkTask(get('error-refund-exceeds'), '', workOf(dir))).success, false)
  const logs = await Promise.all((await f.readdir(`${root}/logs`)).sort().map(n => f.readFile(`${root}/logs/${n}`, 'utf8')))
  assert.equal(failedRequests(logs, '2026-10-08', '/v1/orders'), 32)
  assert.ok(logs.join('').split('\n').filter(l => l.includes('path=/v1/orders') && /status=5\d\d/.test(l)).length > 64, 'counting lines gives a different number')
  const helper = await run('python3', ['.claude/skills/log-analysis/logq.py', '--day', '2026-10-08', '--prefix', '/v1/orders', '--failed'], { cwd: root })
  assert.match(helper.stdout, /^32 failed/, 'the skill helper agrees with the checker')
  say('all ok')
}

main().then(() => { proc.exitCode = 0 }, e => { say(String(e?.stack ?? e)); proc.exitCode = 1 })
