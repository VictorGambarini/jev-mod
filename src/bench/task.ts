// The task level: real headless Claude Code (`claude -p ... --output-format json`) on task cases,
// arm by arm. Each case is copied into a scratch folder; its setup prompts build one session,
// which each arm forks; the arm's steps run in its fork; the checker reads the final answer.
// Settings and the backend reach the mod through the environment only: JEV_MOD_BENCH_OVERLAY
// names an overlay file (core/bench-overlay.ts) and JEV_BACKEND / JEV_PROVIDER pick the backend.
// The person's config files are never written, and no key is set or read here: the mod finds its
// own, as in any session.
//
// The shared setup's spend is a row of its own per case (`setup: true`), so a run's totals hold
// it. A `fresh` case gives each arm its own copy of the fixture instead (a coding task edits it).
// Each arm's row names the models that answered and what each cost. After a case's arms ran, the adapter's verify may turn an arm that did not do its job (a
// compaction that never happened) into an error: such an arm is never scored. Each arm's row holds
// the context its final step read and, when the mod recorded one, what its compaction kept and dropped.

import { PROVIDERS } from '../engine/keys'
import { fs, proc, run, say, warn } from './node'
import { overlayFor } from './plan'
import { toLine } from './results'
import { contextOf, parseClaude, readLedger, setupRow, verifyArms, type Result } from './task-rows'
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
    const prepare = async (folder: string) => {
      await f.mkdir(folder, { recursive: true })
      if (c.fixture) await f.cp(`${o.repo}/${c.fixture}`, folder, { recursive: true })
      if (c.git) {
        // a project under git, as a real one is: the session can diff its own changes
        const git = (...args: string[]) => run('git', ['-c', 'user.name=bench', '-c', 'user.email=bench@example.invalid', ...args], { cwd: folder, timeoutMs: 30_000 })
        for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'fixture']]) await git(...args)
      }
    }
    await prepare(work)
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
    // a case with no setup prompts has no setup row (nothing was spent)
    if (c.setup.length) {
      rows.push(setup)
      await f.appendFile(o.out, toLine(setup) + '\n')
      say(`${c.id}: setup ${setupFailed ? `failed (${setupFailed})` : `done (session ${session ?? 'none'})`}, $${setup.claude_cost_usd!.toFixed(3)} Claude`)
    }
    const done: { arm: Arm; row: Row; run: ArmRun }[] = []
    for (const [k, arm] of o.arms.entries()) {
      const ledger = `${dir}/ledger-${k}`
      // a fresh case: this arm works on its own copy, which its checker reads
      const cwd = c.fresh ? `${dir}/project-${k}` : work
      if (c.fresh) await prepare(cwd)
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
        const r = await claude(step.prompt, cwd, overlay, backendEnv(arm), mine, s === 0 && mine !== null, tools, step.disallowedTools)
        row.wall_ms! += r.ms
        row.claude_cost_usd! += r.cost
        for (const key of ['input', 'output', 'cache_read', 'cache_write'] as const) row.claude_tokens![key] += r.tokens[key]
        for (const [model, usd] of Object.entries(r.models ?? {})) (row.claude_models ??= {})[model] = (row.claude_models[model] ?? 0) + usd
        if (!r.ok) { row.outcome = 'error'; row.error = r.error ?? 'claude failed'; break }
        mine = r.session ?? mine
        if (step.final) { final = r.text; context = contextOf(r.tokens) }
      }
      // the decision model's calls and the compaction, as the mod wrote them to this arm's ledger
      const files: { name: string; text: string }[] = []
      for (const name of await f.readdir(ledger).catch(() => [] as string[])) {
        try { files.push({ name, text: await f.readFile(`${ledger}/${name}`, 'utf8') }) } catch { /* gone */ }
      }
      const book = readLedger(files)
      row.calls = book.calls
      row.cost_usd = book.cost
      if (book.model) row.answered_model = book.model
      row.decision_calls = row.calls
      row.context_tokens = context
      if (book.compaction) row.compaction = book.compaction
      if (row.outcome === 'ok') {
        const checked = await o.adapter.check(c, final, cwd)
        row.success = checked.success
        row.score = checked.score
        if (checked.detail) row.detail = checked.detail
      }
      done.push({ arm, row, run: { ledgerEntries: book.decisions, contextTokens: context, compaction: book.compaction } })
    }
    verifyArms(o.adapter, c, done)
    for (const { arm, row } of done) {
      rows.push(row)
      await f.appendFile(o.out, toLine(row) + '\n')
      const kept = row.compaction ? `, kept ${row.compaction.kept} of ${row.compaction.messages} messages` : ''
      const read = row.context_tokens ? `, question read ${Math.round(row.context_tokens / 1000)}k tokens` : ''
      say(`${c.id} · ${arm.id}: ${row.outcome === 'ok' ? `score ${row.score?.toFixed(2)}` : `error (${row.error})`}${read}${kept}, ` +
        `$${row.claude_cost_usd!.toFixed(3)} Claude, $${row.cost_usd.toFixed(5)} decisions`)
    }
  }
  warn(`scratch folder kept for inspection: ${base}`)
  return rows
}
