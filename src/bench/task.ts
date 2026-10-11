// The task level: real headless Claude Code (`claude -p ... --output-format json`) on task cases,
// arm by arm. Each case is copied into a scratch folder; its setup prompts build one session,
// which each arm forks; the arm's steps run in its fork; the checker reads the final answer.
// Settings and the backend reach the mod through the environment only: JEV_MOD_BENCH_OVERLAY
// names an overlay file (core/bench-overlay.ts) and JEV_BACKEND / JEV_PROVIDER pick the backend.
// The person's config files are never written, and no key is set or read here: the mod finds its
// own, as in any session.
//
// The shared setup's spend is a row of its own per case (`setup: true`), so a run's totals hold
// it. After a case's arms ran, the adapter's verify may turn an arm that did not do its job (a
// compaction that never happened) into an error: such an arm is never scored.

import { PROVIDERS } from '../engine/keys'
import { fs, proc, run, say, warn } from './node'
import { overlayFor } from './plan'
import { toLine } from './results'
import { contextOf, parseClaude, setupRow, verifyArms, type Result } from './task-rows'
import type { Arm, ArmRun, BackendRef, Row, RunMeta, TaskAdapter, TaskCase } from './types'

export type TaskOptions = {
  adapter: TaskAdapter
  arms: Arm[]
  cases: readonly TaskCase[]
  meta: RunMeta
  repo: string
  out: string
  claudeArgs: string[]
  maxUsdPerCall: number
  timeoutMs: number
}

const backendRef = (arm: Arm): BackendRef => arm.backend === null ? { name: 'claude code', kind: 'baseline', model: null }
  : { name: arm.backend, kind: (PROVIDERS as readonly string[]).includes(arm.backend) ? 'provider' : arm.backend === 'default' ? 'default' : 'named', model: null }

function backendEnv(arm: Arm): Record<string, string> {
  if (!arm.backend || arm.backend === 'default') return {}
  if ((PROVIDERS as readonly string[]).includes(arm.backend)) return { JEV_BACKEND: arm.backend, JEV_PROVIDER: arm.backend }
  return { JEV_BACKEND: arm.backend }
}

export async function runTasks(o: TaskOptions): Promise<Row[]> {
  const f = await fs()
  const base = await f.mkdtemp(`${proc.env.TMPDIR || '/tmp'}/jev-mod-bench-`)
  say(`scratch folder: ${base}`)
  const rows: Row[] = []
  const claude = async (prompt: string, cwd: string, overlay: string, env: Record<string, string>, resume: string | null, fork: boolean,
    tools: string[], refused: string[] = []): Promise<Result> => {
    const args = ['-p', prompt, '--output-format', 'json', '--max-budget-usd', String(o.maxUsdPerCall), '--permission-prompts', 'none',
      ...(tools.length ? ['--allowedTools', tools.join(',')] : []), ...(refused.length ? ['--disallowedTools', refused.join(',')] : []),
      ...(resume ? ['--resume', resume, ...(fork ? ['--fork-session'] : [])] : []), ...o.claudeArgs]
    const ran = await run('claude', args, { cwd, timeoutMs: o.timeoutMs, env: { ...proc.env, ...env, JEV_MOD_BENCH_OVERLAY: overlay } })
    const parsed = parseClaude(ran.stdout)
    if (ran.code !== 0 && parsed.ok) return { ...parsed, ok: false, error: `claude exited ${ran.code}`, ms: ran.ms }
    return { ...parsed, ms: ran.ms }
  }
  for (const c of o.cases) {
    const dir = `${base}/${c.id}`
    const work = `${dir}/project`
    await f.mkdir(work, { recursive: true })
    if (c.fixture) await f.cp(`${o.repo}/${c.fixture}`, work, { recursive: true })
    const tools = c.allowedTools ?? []
    // the shared session, built with every feature that changes what the model sees off
    const setupOverlay = `${dir}/overlay-setup.json`
    await f.mkdir(`${dir}/ledger-setup`, { recursive: true })
    await f.writeFile(setupOverlay, JSON.stringify(overlayFor(o.adapter, { id: 'setup', kind: 'claude', backend: null, settings: {} }, `${dir}/ledger-setup`)))
    let session: string | null = null
    let setupFailed: string | null = null
    const setupCalls: Result[] = []
    for (const prompt of c.setup) {
      const r = await claude(prompt, work, setupOverlay, {}, session, false, tools)
      setupCalls.push(r)
      if (!r.ok || !r.session) { setupFailed = r.error ?? 'no session id'; break }
      session = r.session
    }
    const setup = setupRow(o.meta, c.id, setupCalls, setupFailed)
    rows.push(setup)
    await f.appendFile(o.out, toLine(setup) + '\n')
    say(`${c.id}: setup ${setupFailed ? `failed (${setupFailed})` : `done (session ${session ?? 'none'})`}, $${setup.claude_cost_usd!.toFixed(3)} Claude`)
    const done: { arm: Arm; row: Row; run: ArmRun }[] = []
    for (const [k, arm] of o.arms.entries()) {
      const ledger = `${dir}/ledger-${k}`
      const overlay = `${dir}/overlay-${k}.json`
      await f.mkdir(ledger, { recursive: true })
      await f.writeFile(overlay, JSON.stringify(overlayFor(o.adapter, arm, ledger)))
      const row: Row = { ...o.meta, backend: backendRef(arm), answered_model: null, settings: { ...o.meta.settings, ...arm.settings },
        case: c.id, arm: arm.id, outcome: 'ok', items: [], calls: 0, latencies_ms: [], input_tokens: null, cost_usd: 0,
        wall_ms: 0, claude_cost_usd: 0, claude_tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 } }
      let mine = session
      let final = ''
      let context: number | null = null
      if (setupFailed) { row.outcome = 'error'; row.error = `setup: ${setupFailed}` }
      for (const [s, step] of o.adapter.steps(c, arm).entries()) {
        if (row.outcome === 'error') break
        const r = await claude(step.prompt, work, overlay, backendEnv(arm), mine, s === 0 && mine !== null, tools, step.disallowedTools)
        row.wall_ms! += r.ms
        row.claude_cost_usd! += r.cost
        for (const key of ['input', 'output', 'cache_read', 'cache_write'] as const) row.claude_tokens![key] += r.tokens[key]
        if (!r.ok) { row.outcome = 'error'; row.error = r.error ?? 'claude failed'; break }
        mine = r.session ?? mine
        if (step.final) { final = r.text; context = contextOf(r.tokens) }
      }
      // the decision model's calls, as the mod wrote them to this arm's ledger
      const entries = await f.readdir(ledger).catch(() => [] as string[])
      for (const name of entries) {
        try {
          const e = JSON.parse(await f.readFile(`${ledger}/${name}`, 'utf8')) as { calls?: number; cost?: number; model?: string | null }
          row.calls += e.calls ?? 0
          row.cost_usd += e.cost ?? 0
          if (e.model) row.answered_model = e.model
        } catch { /* a half-written entry */ }
      }
      row.decision_calls = row.calls
      if (row.outcome === 'ok') {
        const checked = await o.adapter.check(c, final, work)
        row.success = checked.success
        row.score = checked.score
        if (checked.detail) row.detail = checked.detail
      }
      done.push({ arm, row, run: { ledgerEntries: entries.length, contextTokens: context } })
    }
    verifyArms(o.adapter, c, done)
    for (const { arm, row } of done) {
      rows.push(row)
      await f.appendFile(o.out, toLine(row) + '\n')
      say(`${c.id} · ${arm.id}: ${row.outcome === 'ok' ? `score ${row.score?.toFixed(2)}` : `error (${row.error})`}, $${row.claude_cost_usd!.toFixed(3)} Claude, $${row.cost_usd.toFixed(5)} decisions`)
    }
  }
  warn(`scratch folder kept for inspection: ${base}`)
  return rows
}
