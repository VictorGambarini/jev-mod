// The task level: real headless Claude Code (`claude -p ... --output-format json`) on task cases,
// arm by arm. Settings and the backend reach the mod through the environment only:
// JEV_MOD_BENCH_OVERLAY names an overlay file (core/bench-overlay.ts) and JEV_BACKEND /
// JEV_PROVIDER pick the backend. The person's config files are never written, and no key is set
// or read here: the mod finds its own, as in any session.
//
// Every arm works in a fresh copy of the project of its own (project.ts), and the checker reads
// that copy. A case with setup prompts builds one session first, which each arm forks; the
// project as the setup left it is put back before each arm in the same folder, since a session
// is resumed from the folder it was made in. The setup's spend is a row of its own per case
// (`setup: true`), so a run's totals hold it.
//
// Every call loads only what the bench gives it (ISOLATED): no MCP server but those an arm passes
// with --mcp-config, and no user settings, so none of the person's other plugins, hooks or user
// skills; the project's own settings and the checkout passed with --plugin-dir still load.
//
// Plain Claude Code is jev-mod switched off whole (plain.ts: a kill file in a scratch config
// folder), for every `claude` arm and the shared setup; a plain row that shows decision calls is an
// error, `decisions_in_plain_arm`. The jev-mod arm uses the person's own config and backend, with
// every feature the overlay may switch off switched off but the one under test (plan.ts
// overlayFor); what other features still asked is in the row's `by_feature`, apart from the
// feature's own decisions.
//
// After a case's arms ran, the adapter's verify may turn an arm that did not do its job (a
// compaction that never happened) into an error: such an arm is never scored. Each arm's row holds
// the context its final step read, the models that answered and what each cost, and, when the mod
// recorded one, what its compaction kept and dropped.

import { PROVIDERS } from '../engine/keys'
import './gate-sys' // the gate benches' cases reach the machine through it
import { fs, proc, run, say, warn } from './node'
import { plainConfig } from './plain'
import { overlayFor } from './plan'
import { buildProject } from './project'
import { toLine } from './results'
import { contextOf, parseClaude, readLedger, setupRow, verifyArms, type Result } from './task-rows'
import type { Arm, ArmRun, ArmSetup, BackendRef, Row, RunMeta, TaskAdapter, TaskCase } from './types'

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

/**
 * What every `claude -p` of a task run gets, so it loads only what the bench gives it: MCP servers
 * from --mcp-config alone, and the project's and local settings but not the user's (the person's
 * other plugins, hooks, skills and CLAUDE.md). Sign-in is not a setting and still works.
 */
export const ISOLATED = ['--strict-mcp-config', '--setting-sources', 'project,local']

/** An error code for a plain arm whose ledger shows decisions: jev-mod was not off in it. */
export const PLAIN_DECIDED = 'decisions_in_plain_arm'

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
  const plain = await plainConfig()
  const rows: Row[] = []
  const claude = async (prompt: string, cwd: string, overlay: string, env: Record<string, string>, resume: string | null, fork: boolean,
    tools: string[], refused: string[] = [], more: string[] = []): Promise<Result> => {
    const args = ['-p', prompt, '--output-format', 'json', '--max-budget-usd', String(o.maxUsdPerCall), '--permission-prompts', 'none',
      ...ISOLATED, ...(tools.length ? ['--allowedTools', tools.join(',')] : []), ...(refused.length ? ['--disallowedTools', refused.join(',')] : []),
      ...(resume ? ['--resume', resume, ...(fork ? ['--fork-session'] : [])] : []), ...o.claudeArgs, ...more]
    const ran = await run('claude', args, { cwd, timeoutMs: o.timeoutMs, env: { ...proc.env, ...env, JEV_MOD_BENCH_OVERLAY: overlay } })
    const parsed = parseClaude(ran.stdout)
    if (ran.code !== 0 && parsed.ok) return { ...parsed, ok: false, error: `claude exited ${ran.code}`, ms: ran.ms }
    return { ...parsed, ms: ran.ms }
  }
  try {
    for (const c of o.cases) {
      const dir = `${base}/${c.id}`
      const tools = c.allowedTools ?? []
      // with setup prompts, one folder: the session built there, the project as it left it put back before each arm
      const shared = c.setup.length ? `${dir}/project` : null
      let session: string | null = null
      let setupFailed: string | null = null
      if (shared) {
        try { await buildProject(o.repo, c, shared) } catch (error) { setupFailed = `project: ${(error as Error).message.slice(0, 120)}` }
        const setupOverlay = `${dir}/overlay-setup.json`
        await f.mkdir(`${dir}/ledger-setup`, { recursive: true })
        await f.writeFile(setupOverlay, JSON.stringify(overlayFor(o.adapter, { id: 'setup', kind: 'claude', backend: null, settings: {} }, `${dir}/ledger-setup`)))
        const setupCalls: Result[] = []
        for (const prompt of setupFailed ? [] : c.setup) {
          const r = await claude(prompt, shared, setupOverlay, plain.env, session, false, tools)
          setupCalls.push(r)
          if (!r.ok || !r.session) { setupFailed = r.error ?? 'no session id'; break }
          session = r.session
        }
        const setup = setupRow(o.meta, c.id, setupCalls, setupFailed)
        rows.push(setup)
        await f.appendFile(o.out, toLine(setup) + '\n')
        say(`${c.id}: setup ${setupFailed ? `failed (${setupFailed})` : `done (session ${session ?? 'none'})`}, $${setup.claude_cost_usd!.toFixed(3)} Claude`)
        if (!setupFailed) await f.cp(shared, `${dir}/pristine`, { recursive: true })
      }
      const done: { arm: Arm; row: Row; run: ArmRun }[] = []
      for (const [k, arm] of o.arms.entries()) {
        const ledger = `${dir}/ledger-${k}`
        const overlay = `${dir}/overlay-${k}.json`
        // the arm's own folder outside the project (a local site's log), and its own copy of the project
        const armDir = `${dir}/arm-${k}`
        const work = shared ?? `${armDir}/project`
        await f.mkdir(ledger, { recursive: true })
        await f.mkdir(armDir, { recursive: true })
        await f.writeFile(overlay, JSON.stringify(overlayFor(o.adapter, arm, ledger)))
        const row: Row = { ...o.meta, backend: backendRef(arm), answered_model: null, settings: { ...o.meta.settings, ...arm.settings },
          case: c.id, arm: arm.id, outcome: 'ok', items: [], calls: 0, latencies_ms: [], input_tokens: null, cost_usd: 0,
          wall_ms: 0, claude_cost_usd: 0, claude_tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 } }
        const fail = (error: string) => { row.outcome = 'error'; row.error = error }
        if (setupFailed) fail(`setup: ${setupFailed}`)
        else {
          try {
            if (shared) { if (k > 0) { await f.rm(shared, { recursive: true, force: true }); await f.cp(`${dir}/pristine`, shared, { recursive: true }) } }
            else await buildProject(o.repo, c, work)
          } catch (error) { fail(`project: ${(error as Error).message.slice(0, 120)}`) }
        }
        let extra: ArmSetup = {}
        if (o.adapter.beforeArm && row.outcome === 'ok') {
          try { extra = await o.adapter.beforeArm(c, arm, armDir, work) } catch (error) { fail(`beforeArm: ${(error as Error).message.slice(0, 120)}`) }
        }
        let mine = session
        let final = ''
        let context: number | null = null
        try {
          const env = { ...backendEnv(arm), ...(arm.kind === 'claude' ? plain.env : {}), ...extra.env }
          const filled = (prompt: string) => prompt.replace(/\{\{(\w+)\}\}/g, (all, name: string) => extra.vars?.[name] ?? all)
          for (const [s, step] of o.adapter.steps(c, arm).entries()) {
            if (row.outcome === 'error') break
            const r = await claude(filled(step.prompt), work, overlay, env, mine, s === 0 && mine !== null, tools, step.disallowedTools, extra.claudeArgs)
            row.wall_ms! += r.ms
            row.claude_cost_usd! += r.cost
            for (const key of ['input', 'output', 'cache_read', 'cache_write'] as const) row.claude_tokens![key] += r.tokens[key]
            for (const [model, usd] of Object.entries(r.models ?? {})) (row.claude_models ??= {})[model] = (row.claude_models[model] ?? 0) + usd
            if (r.turns !== undefined) row.claude_turns = (row.claude_turns ?? 0) + r.turns
            if (!r.ok) { fail(r.error ?? 'claude failed'); break }
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
          if (Object.keys(book.byFeature).length) row.by_feature = book.byFeature
          row.context_tokens = context
          if (book.compaction) row.compaction = book.compaction
          // plain Claude Code asks no decision model: one that did had jev-mod on, and is not plain
          if (arm.kind === 'claude' && book.decisions > 0 && row.outcome === 'ok') fail(PLAIN_DECIDED)
          if (row.outcome === 'ok') {
            const checked = await o.adapter.check(c, final, work, armDir)
            row.success = checked.success
            row.score = checked.score
            if (checked.detail) row.detail = checked.detail
          }
          done.push({ arm, row, run: { ledgerEntries: book.decisions, byFeature: book.byFeature, contextTokens: context, compaction: book.compaction } })
        } finally {
          try { await extra.stop?.() } catch { /* stopped or gone */ }
        }
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
  } finally {
    await plain.remove()
  }
  warn(`scratch folder kept for inspection: ${base}`)
  return rows
}
