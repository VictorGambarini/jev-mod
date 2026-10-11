// Checks the find-files task bench against the real files, which plugin tests cannot read:
//
//   bun src/features/find-files/bench/task-check.ts
//
// 1. The fixture (task-fixture/) still has what the tasks expect: its size, the near-misses, each gold
//    file, each gold line matching its pattern, and nothing else in the code that would also be right.
// 2. A fake run: the whole task runner (copy the fixture, make it a git repository, run both arms, read
//    the ledger, check the answers, write rows) with a stand-in `claude` on PATH that answers from files, so
//    it costs nothing and needs no key. No real model is involved: it proves the plumbing and the checker.

import { fs, proc, repoRoot, run, say } from '../../../bench/node'
import { armsFor } from '../../../bench/plan'
import { fromLines } from '../../../bench/results'
import { runTasks } from '../../../bench/task'
import type { RunMeta } from '../../../bench/types'
import { task, TASKS, type FindTask } from './task'

const FIXTURE = `${repoRoot()}/src/features/find-files/bench/task-fixture`
const meta: RunMeta = { schema: 1, run: 'check', feature: 'find-files', level: 'task', jevmod: '0', git: 'check', date: 'now', settings: {}, sweep: null }
let failed = 0
const check = (ok: boolean, what: string) => { say(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++ }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

async function grep(pattern: string): Promise<string[]> {
  const r = await run('grep', ['-rnIE', pattern, '.'], { cwd: FIXTURE, timeoutMs: 30_000 })
  return r.stdout.split('\n').filter(Boolean).map(l => l.replace(/^\.\//, ''))
}
const filesOf = (lines: string[], prefix: RegExp) => [...new Set(lines.filter(l => prefix.test(l)).map(l => l.split(':')[0]!))].sort()

async function fixture() {
  const f = await fs()
  const all = (await run('find', ['.', '-type', 'f'], { cwd: FIXTURE, timeoutMs: 30_000 })).stdout.split('\n').filter(Boolean)
  check(all.length >= 300, `the fixture has ${all.length} files (at least 300)`)
  check(!all.some(p => /\.test\.tsx?$/.test(p)), 'no *.test.ts in the fixture (plugin tests would try to load them)')
  for (const near of ['src/payments/gateway/retry.ts', 'src/jobs/queue/backoff.ts', 'src/billing/money/round.ts', 'src/admin/tax-override.ts',
    'src/webhooks/dispatcher/sign.ts', 'src/http/middleware/session-auth.ts', 'src/reports/pdf-export.ts', 'src/billing/dunning/run-dunning.ts',
    'migrations/0014_create_archived_invoices.sql', 'src/lib/csv/write-csv.ts']) check(all.includes(`./${near}`), `near-miss ${near} is there`)
  for (const t of TASKS) {
    for (const g of t.gold) {
      const text = await f.readFile(`${FIXTURE}/${g.path}`, 'utf8').catch(() => null)
      check(text !== null, `${t.id}: ${g.path} exists`)
      if (text !== null && g.needle) {
        const at = text.split('\n').findIndex(l => g.needle!.test(l)) + 1
        check(at === g.line, `${t.id}: ${g.path} matches ${g.needle} on line ${g.line} (found ${at})`)
      }
    }
  }
  const gold = (id: string) => TASKS.find(t => t.id === id)!.gold.map(g => g.path).sort()
  check(same(filesOf(await grep('process\\.env(\\.TAX_RATE\\b|\\[.TAX_RATE.\\])'), /^(src|scripts)\//), gold('tax-rate-env')), 'TAX_RATE is read in exactly the gold files of src/ and scripts/')
  check(same(filesOf(await grep('await refundPayment\\('), /^src\//), gold('refund-callers')), 'refundPayment is called in exactly the gold files of src/')
  check(same(filesOf(await grep('(ALTER TABLE|CREATE TABLE|UPDATE|ON) invoices( |$|\\()'), /^migrations\//), gold('invoice-migrations')), 'the invoices table is touched by exactly the gold migrations')
  check(same(filesOf(await grep('createHmac'), /^src\/webhooks\/inbound\//), gold('provider-signature').filter(p => p.includes('verify'))), 'only verify-signature.ts computes an inbound HMAC')
}

async function fakeRun() {
  const f = await fs()
  const tmp = await f.mkdtemp(`${proc.env.TMPDIR || '/tmp'}/find-files-task-check-`)
  await f.mkdir(`${tmp}/bin`, { recursive: true })
  await f.writeFile(`${tmp}/bin/claude`, `#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
case = os.path.basename(os.path.dirname(os.environ['JEV_MOD_BENCH_OVERLAY']))
overlay = json.load(open(os.environ['JEV_MOD_BENCH_OVERLAY']))
on = overlay['features'].get('find-files', {}).get('mode') == 'on'
assert os.path.isdir('src') and os.path.isdir('.git'), 'the project was not copied as a git repository'
assert '--disallowedTools' in args and 'Edit' in args[args.index('--disallowedTools') + 1]
if on:
    open(os.path.join(overlay['ledger'], 'call-1.json'), 'w').write(json.dumps({'feature': 'find-files', 'calls': 2, 'cost': 0.0004, 'model': 'stand-in', 'error': None}))
text = open(os.path.join(os.environ['ANSWERS'], ('jev-' if on else 'plain-') + case + '.txt')).read()
print(json.dumps({'type': 'result', 'is_error': False, 'result': text, 'session_id': 's-1', 'total_cost_usd': 0.1 if on else 0.2,
                  'usage': {'input_tokens': 10, 'output_tokens': 5, 'cache_read_input_tokens': 1000}}))
`)
  await run('chmod', ['+x', `${tmp}/bin/claude`])
  await f.mkdir(`${tmp}/answers`, { recursive: true })
  const byId = (id: string) => TASKS.find(t => t.id === id)!
  const right = (t: FindTask) => t.gold.map(g => (t.format === 'lines' ? `${g.path}:${g.line}` : g.path))
  const put = (arm: string, t: FindTask, lines: string[]) => f.writeFile(`${tmp}/answers/${arm}-${t.id}.txt`, `Found it.\n\nANSWERS\n${lines.join('\n')}\n`)
  const exp = byId('customers-export')
  const tax = byId('tax-rate-env')
  // plain Claude Code: one extra file on one task (the shared writer), one file short on the other; the find-files arm gets both right
  await put('plain', exp, [...right(exp), 'src/lib/csv/write-csv.ts'])
  await put('plain', tax, right(tax).slice(1))
  await put('jev', exp, right(exp))
  await put('jev', tax, right(tax))
  const saved = { path: proc.env.PATH, answers: proc.env.ANSWERS }
  proc.env.PATH = `${tmp}/bin:${saved.path ?? ''}`
  proc.env.ANSWERS = `${tmp}/answers`
  try {
    const out = `${tmp}/rows.jsonl`
    const rows = await runTasks({ adapter: task, arms: armsFor(task, ['openrouter'], null, {}), cases: [exp, tax], meta, repo: repoRoot(), out,
      claudeArgs: [], maxUsdPerCall: 1, timeoutMs: 120_000 })
    const mine = (c: string, a: string) => rows.find(r => r.case === c && r.arm === a)!
    const j = 'jev-mod openrouter'
    check(rows.filter(r => r.setup).length === 0, 'no setup row for a case with no setup prompts')
    check(mine(exp.id, 'claude').outcome === 'ok' && mine(exp.id, 'claude').success === false, 'plain: the extra file fails the case')
    check(same([mine(exp.id, 'claude').detail?.precision, mine(exp.id, 'claude').detail?.recall], [2 / 3, 1]), 'plain: precision 2/3, recall 1')
    check(mine(tax.id, 'claude').success === false && mine(tax.id, 'claude').detail?.recall === 2 / 3, 'plain: a missed read gives recall 2/3')
    check(mine(exp.id, j).success === true && mine(tax.id, j).success === true, 'find-files arm: both right, success')
    check(mine(exp.id, j).claude_cost_usd === 0.1 && mine(exp.id, 'claude').claude_cost_usd === 0.2, 'Claude cost is read from each arm')
    check(mine(exp.id, j).calls === 2 && Math.abs(mine(exp.id, j).cost_usd - 0.0004) < 1e-9 && mine(exp.id, 'claude').calls === 0, 'decision calls and cost come from the ledger, only for the find-files arm')
    check(rows.every(r => r.setup || (r.wall_ms ?? -1) >= 0), 'wall time recorded')
    check(fromLines(await f.readFile(out, 'utf8')).rows.length === rows.length, 'the rows on disk are the rows returned')
  } finally {
    if (saved.path !== undefined) proc.env.PATH = saved.path
    if (saved.answers === undefined) delete proc.env.ANSWERS
    else proc.env.ANSWERS = saved.answers
    await f.rm(tmp, { recursive: true, force: true })
  }
}

await fixture()
await fakeRun()
say(failed ? `${failed} check(s) failed` : 'all checks passed')
proc.exitCode = failed ? 1 : 0
