// Run a feature's bench. See README.md in this folder.
//
//   bun src/bench/run.ts compact --backend fake                                   # the fake backend: no key, no network
//   bun src/bench/run.ts compact --backend typesafe --sweep drop=0.5:0.95:0.05    # one real pass; the sweep is offline
//   bun src/bench/run.ts compact --level task --backend typesafe --sweep drop=0.6:0.9:0.1          # prints the plan only
//   bun src/bench/run.ts compact --level task --backend typesafe --sweep drop=0.6:0.9:0.1 --yes    # spends money
//   bun src/bench/run.ts browser --level task --backend openrouter --repeat 3                     # each case × arm three times

import { VERSION } from '../version'
import { type Args, caseWanted, parseArgs } from './args'
import { runDecision, fakeHostFor } from './decision'
import { BENCHES, fakeDir, resultsDir } from './features'
import { chooseBackend } from './host'
import { thresholds } from './metrics'
import { fs, proc, repoRoot, run, say, warn } from './node'
import { armsFor, guard, plan } from './plan'
import { fileName, toLine } from './results'
import { runTasks } from './task'
import type { Row, RunMeta } from './types'

const USAGE = `usage: bun src/bench/run.ts <feature> [--level decision|task] --backend <name>[,<name>...]
  [--sweep name=from:to:step] [--set name=value ...] [--cases id,id] [--timeout ms]
  task level only: [--yes] [--repeat n] [--usd-per-call n] [--max-usd-per-call n] [--claude-arg <arg> ...]
features: ${Object.keys(BENCHES).join(', ')}
backends: fake, default, typesafe, openrouter, venice, zen, or a name from backends.json`

async function gitSha(repo: string): Promise<string> {
  const head = await run('git', ['rev-parse', 'HEAD'], { cwd: repo, timeoutMs: 5000 })
  const dirty = await run('git', ['status', '--porcelain'], { cwd: repo, timeoutMs: 5000 })
  const sha = head.code === 0 ? head.stdout.trim() : 'unknown'
  return dirty.code === 0 && dirty.stdout.trim() ? `${sha}-dirty` : sha
}

async function main(): Promise<number> {
  let a: Args
  try { a = parseArgs(proc.argv.slice(2)) } catch (error) { warn(`${(error as Error).message}\n\n${USAGE}`); return 2 }
  const bench = BENCHES[a.feature]
  if (!bench) { warn(`no bench for ${a.feature}\n\n${USAGE}`); return 2 }
  const repo = repoRoot()
  const f = await fs()
  const date = new Date().toISOString()
  const meta: RunMeta = { schema: 1, run: `${date}-${Math.random().toString(36).slice(2, 8)}`, feature: a.feature, level: a.level,
    jevmod: VERSION, git: await gitSha(repo), date, settings: a.settings, sweep: a.sweep ? `${a.sweep.name}=${a.sweep.from}:${a.sweep.to}:${a.sweep.step}` : null }

  if (a.level === 'decision') {
    const adapter = bench.decision
    if (!adapter) { warn(`${a.feature} has no decision-level bench`); return 2 }
    if (a.sweep && a.sweep.name !== adapter.threshold.name) { warn(`${a.feature} sweeps ${adapter.threshold.name}, not ${a.sweep.name}`); return 2 }
    for (const name of a.backends) {
      const fake = name === 'fake'
      const dir = `${repo}/${fake ? fakeDir(a.feature) : resultsDir(a.feature)}`
      await f.mkdir(dir, { recursive: true })
      // the fake's file has a fixed name, so trying it again replaces the example instead of piling up
      const out = `${dir}/${fake ? 'decision-fake.fake.jsonl' : fileName(date, 'decision', name, false)}`
      let chosen
      if (fake) chosen = { ref: { name: 'fake', kind: 'fake' as const, model: 'fake-jev' }, hostFor: fakeHostFor(adapter), keyFrom: 'none' }
      else {
        try {
          const c = await chooseBackend(name)
          chosen = { ref: c.ref, hostFor: () => c.host, keyFrom: c.keyFrom }
        } catch (error) { warn(`${name}: ${(error as Error).message}`); return 1 }
      }
      const count = adapter.cases().filter(c => caseWanted(a.cases, adapter.caseId(c))).length
      say(`${a.feature}: ${count} case(s) on ${name}${chosen.ref.model ? ` (${chosen.ref.model})` : ''}, key from ${chosen.keyFrom}; writing ${out}`)
      if (fake) await f.writeFile(out, '')
      const baselines = adapter.baselines?.(meta) ?? []
      for (const row of baselines) await f.appendFile(out, toLine(row) + '\n')
      const rows = await runDecision({ adapter, backend: chosen.ref, hostFor: chosen.hostFor, meta, timeoutMs: a.timeoutMs,
        settings: a.settings, ...(a.cases ? { only: adapter.cases().map(c => adapter.caseId(c)).filter(id => caseWanted(a.cases, id)) } : {}),
        onRow: async (row: Row) => {
          await f.appendFile(out, toLine(row) + '\n')
          say(`  ${row.case}: ${row.outcome}${row.error ? ` (${row.error})` : ''}, ${row.items.length} judged, ${row.calls} call(s), $${row.cost_usd.toFixed(6)}`)
        } })
      const cost = rows.reduce((s, r) => s + r.cost_usd, 0)
      const sweep = a.sweep ? thresholds(a.sweep) : thresholds(adapter.threshold)
      say(`done: ${rows.filter(r => r.outcome === 'ok').length}/${rows.length} ok, $${cost.toFixed(5)}; the sweep ${sweep[0]}..${sweep[sweep.length - 1]} is computed by the report:\n` +
        `  bun src/bench/report.ts ${a.feature}${fake ? ' --fake' : ''}`)
    }
    return 0
  }

  const adapter = bench.task
  if (!adapter) { warn(`${a.feature} has no task-level bench`); return 2 }
  const cases = adapter.cases().filter(c => caseWanted(a.cases, c.id))
  if (a.backends.includes('fake')) { warn('the fake backend is decision level only: a headless Claude Code run cannot reach it'); return 2 }
  const swept = a.sweep ? { name: a.sweep.name, values: thresholds(a.sweep) } : null
  const arms = armsFor(adapter, a.backends, swept, a.settings)
  const p = plan(adapter, cases, arms, a.usdPerCall, undefined, a.repeat)
  const refused = guard(p, a.yes)
  if (refused) { say(refused); return a.yes ? 1 : 0 }
  say(p.text)
  const dir = `${repo}/${resultsDir(a.feature)}`
  await f.mkdir(dir, { recursive: true })
  const out = `${dir}/${fileName(date, 'task', a.backends.join('+'), false)}`
  say(`writing ${out}`)
  const rows = await runTasks({ adapter, arms, cases, meta, repo, out, claudeArgs: a.claudeArgs, repeat: a.repeat,
    maxUsdPerCall: a.maxUsdPerCall ?? adapter.maxUsdPerCall ?? 2, timeoutMs: 15 * 60_000 })
  const sum = (mine: readonly Row[], f: (r: Row) => number) => mine.reduce((n, r) => n + f(r), 0)
  const setup = rows.filter(r => r.setup)
  const failed = rows.filter(r => !r.setup && r.outcome === 'error')
  say(`spent: $${sum(rows, r => r.claude_cost_usd ?? 0).toFixed(2)} Claude (setup $${sum(setup, r => r.claude_cost_usd ?? 0).toFixed(2)}), ` +
    `$${sum(rows, r => r.cost_usd).toFixed(4)} decisions; ${failed.length} arm run(s) failed` +
    `${failed.length ? ` (${[...new Set(failed.map(r => r.error))].join(', ')})` : ''}`)
  say(`done. Plots and the table: bun src/bench/report.ts ${a.feature}`)
  return 0
}

main().then(code => { proc.exitCode = code }, error => { warn(String((error as Error)?.stack ?? error)); proc.exitCode = 1 })
