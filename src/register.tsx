import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { AccessState, BandFeatures } from '../types'
import { onboard } from './features/band'
import { line } from './features/band/line'
import { configured, modeOf } from './core/config'
import type { IO } from './core/io'
import * as memory from './core/memory'
import * as accessGate from './features/access-gate'
import * as browser from './features/browser'
import * as command from './features/command'
import * as compact from './features/compact'
import * as findFiles from './features/find-files'
import * as reviewTriage from './features/review-triage'
import * as routing from './features/routing'
import * as rulesGate from './features/rules-gate'
import * as screening from './features/screening'
import * as skills from './features/skills'
import * as toolGate from './features/tool-gate'
import * as stopGate from './features/stop-gate'
import * as trimOutput from './features/trim-output'

// jev-mod: a cheap decision model (Jev, or any decision backend) makes the small decisions
// inside Claude Code, so the expensive model only does the work.
//
// This is the one file that holds Claude Code's engine handle (`$`): the plugin validator never
// lets `$` cross an import. It builds an IO from `$` (core/io.ts), wires each hook to the
// features, and does nothing else. A feature never sees `$`; adding one means a folder under
// features/ and its lines here (docs/ADDING-A-FEATURE.md).
//
// Every decision fails open: a feature that cannot decide leaves the request exactly as Claude
// Code would have sent it. Each hook says so itself: its `.catch` passes the event on unchanged
// (a throwing hook would be skipped anyway; this makes that the mod's choice, not the engine's).

/**
 * An environment variable. The validator wants each `$.env.get` named by literal, so the ones
 * the engine reads are listed; any other (a backend's own key variable, which its config
 * names) is read by running printenv.
 */
async function envOf($: any, name: string): Promise<string | undefined> {
  const read = (value: string | null | undefined) => value ?? undefined
  switch (name) {
    case 'HOME': return read(await $.env.get('HOME'))
    case 'XDG_CONFIG_HOME': return read(await $.env.get('XDG_CONFIG_HOME'))
    case 'XDG_CACHE_HOME': return read(await $.env.get('XDG_CACHE_HOME'))
    case 'JEV_HOME': return read(await $.env.get('JEV_HOME'))
    case 'JEV_BACKEND': return read(await $.env.get('JEV_BACKEND'))
    case 'JEV_BACKENDS': return read(await $.env.get('JEV_BACKENDS'))
    case 'JEV_PROVIDER': return read(await $.env.get('JEV_PROVIDER'))
    case 'JEV_MODEL': return read(await $.env.get('JEV_MODEL'))
    case 'TYPESAFE_MODEL': return read(await $.env.get('TYPESAFE_MODEL'))
    case 'TYPESAFE_BASE_URL': return read(await $.env.get('TYPESAFE_BASE_URL'))
    case 'TYPESAFE_API_KEY': return read(await $.env.get('TYPESAFE_API_KEY'))
    case 'OPENROUTER_API_KEY': return read(await $.env.get('OPENROUTER_API_KEY'))
    case 'VENICE_API_KEY': return read(await $.env.get('VENICE_API_KEY'))
    case 'OPENCODE_ZEN_API_KEY': return read(await $.env.get('OPENCODE_ZEN_API_KEY'))
    case 'JEV_PROXY_API_KEY': return read(await $.env.get('JEV_PROXY_API_KEY'))
    case 'JEV_MOD_DASHBOARD': return read(await $.env.get('JEV_MOD_DASHBOARD'))
    case 'JEV_MOD_BROWSER_CDP': return read(await $.env.get('JEV_MOD_BROWSER_CDP'))
    case 'JEV_MOD_BROWSER_DIR': return read(await $.env.get('JEV_MOD_BROWSER_DIR'))
    default: {
      if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) return undefined
      try {
        const ran = await $.process.run(['printenv', name], { timeoutMs: 5000 })
        return ran.exitCode === 0 ? ran.stdout.replace(/\n$/, '') : undefined
      } catch {
        return undefined
      }
    }
  }
}

// Theme keys, so the band follows light and dark themes on every surface.
const THEME = { yellow: 'warning', red: 'error', green: 'success' } as const

const band = atom({ plugin: 'jev-mod', key: 'band' } as const, null as BandFeatures | null)

/** The access gate's allows for this session: held by the host, never written to disk. */
const access = atom({ plugin: 'jev-mod', key: 'access' } as const, null as AccessState | null)

/** Whether the band is drawn: read from the config when an event comes, not on every draw. */
let bandOn = true

/** Redraw the band from the session's record, after a hook that may have changed it. */
async function refresh($: any): Promise<void> {
  try {
    bandOn = await modeOf(ioOf($), 'band') !== 'off'
    const io = ioOf($)
    const mod = { configured: await configured(io) }
    const open = await accessGate.open(io)
    await update($, band, () => ({ ...memory.snapshot(), mod, ...(open.length ? { access: { open } } : {}) }))
  } catch { /* the band is cosmetic */ }
}

/** The mod's settings (its manifest's userConfig), as Claude Code handed them to register. */
let options: Record<string, unknown> = {}

function ioOf($: any): IO {
  return {
    option: name => options[name] as string | boolean | undefined,
    run: (argv, init) => $.process.run(argv, init),
    spawn: (argv, init) => $.process.spawn({ argv, ...init }),
    pluginRoot: () => $.plugin.root,
    fetch: (url, init) => $.http.fetch(url, init),
    readFile: path => $.fs.read(path),
    folders: async path => {
      try {
        const entries: { name: string; kind: string; isLink: boolean }[] = await $.fs.list(path)
        const linked = await Promise.all(entries.map(async entry => entry.isLink
          && (await $.fs.stat(`${path}/${entry.name}`).catch(() => undefined))?.kind === 'dir'))
        return entries.filter((entry, i) => entry.kind === 'dir' || linked[i]).map(entry => entry.name)
      } catch {
        return []
      }
    },
    files: async path => {
      try {
        const entries: { name: string; kind: string; mtimeMs: number }[] = await $.fs.list(path)
        return entries.filter(entry => entry.kind === 'file').map(entry => ({ name: entry.name, mtimeMs: entry.mtimeMs }))
      } catch {
        return []
      }
    },
    writeFile: (path, text) => $.fs.write(path, text),
    home: () => $.env.get('HOME'),
    env: name => envOf($, name),
    sleep: ms => $.clock.sleep(ms),
    sessionId: () => $.session.id(),
    projectRoot: async () => {
      try { return await $.session.root() } catch { return undefined }
    },
    // The listing the model reads, estimated locally ("summary" sends nothing anywhere).
    skillNames: async () => {
      try {
        const { context } = await $.session.usage({ breakdown: 'summary' })
        const listed = context.breakdown?.skills?.skillFrontmatter
        return Array.isArray(listed) ? listed.map((skill: { name: string }) => skill.name) : null
      } catch {
        return null
      }
    },
    usage: async () => {
      const { context } = await $.session.usage()
      return { contextTokens: context.tokens ?? 0, contextWindow: context.window, contextPercent: context.percent }
    },
    messages: () => $.session.messages(),
    accessState: () => read($, access),
    setAccessState: value => update($, access, () => value).then(() => undefined),
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    status: text => $.ui.status(text),
    toast: text => $.ui.toast(text),
    runCommand: (command, args) => $.command.run({ command, args }),
    after: (ms, fn) => { $.clock.after(ms, fn) },
  }
}

/** Whether find-files' tool has been offered to the model in this process. */
let findFilesOffered = false

/**
 * find-files' tool, registered once it is on: at session start, or at the first prompt after it
 * was turned on. Registering is for the session; turned off, the tool stays and answers so.
 */
async function offerFindFiles($: any): Promise<void> {
  if (findFilesOffered) return
  try {
    if (!(await findFiles.offered(ioOf($)))) return
    await $.tool.register(findFiles.SPEC)
    findFilesOffered = true
  } catch { /* not offered: Glob and Grep as ever */ }
}

/** Whether review-triage's tool has been offered to the model in this process. */
let reviewTriageOffered = false

/** review-triage's tool, registered once it is on, as find-files' tool is. */
async function offerReviewTriage($: any): Promise<void> {
  if (reviewTriageOffered) return
  try {
    if (!(await reviewTriage.offered(ioOf($)))) return
    await $.tool.register(reviewTriage.SPEC)
    reviewTriageOffered = true
  } catch { /* not offered */ }
}

/** Whether the browser's browse tool has been offered to the model in this process. */
let browseOffered = false

/** The browse tool, registered once the browser feature is on, as find-files' tool is. */
async function offerBrowse($: any): Promise<void> {
  if (browseOffered) return
  try {
    if (!(await browser.offered(ioOf($)))) return
    await $.tool.register(browser.SPEC)
    browseOffered = true
  } catch { /* not offered */ }
}

/**
 * A failed call's answer with a shorter error text. Core takes a hook's `result` only in the
 * tool's own record shape and reads no `isError` from a hook, so a record would reach the model
 * as a success; `{ deny }` after the tool ran undoes nothing and is the one answer the model
 * reads as an error (is_error), with this text, "Exit code N" still first.
 */
function failedWith(text: string) {
  return { deny: text }
}

// A change in /config, or a key set in the plugin's settings, reloads this module with the new options.
export const register: Register = (on, given) => {
  options = { ...(given ?? {}) }
  on('session.start', async ($, e, next) => {
    await $.command.register(command.command)
    await offerFindFiles($)
    await offerReviewTriage($)
    await offerBrowse($)
    await onboard(ioOf($))
    await refresh($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Every browser the browse tool holds (a paused one included) closes with the session.
  on('session.end', async ($, e, next) => {
    browser.closeAll()
    return next(e)
  }).catch(($, e, next) => next(e))

  // Each feature's look at the prompt, all at once: the prompt waits for the slowest, not the sum.
  on('prompt.submit', async ($, e, next) => {
    const text = e.text
    if (!text.trim() || text.trimStart().startsWith('/')) return next(e)
    const io = ioOf($)
    await memory.load(io)
    const [suggestion] = await Promise.all([skills.analyse(io, text), routing.analyse(io, text), toolGate.analyse(io, text),
      offerFindFiles($), offerReviewTriage($), offerBrowse($)])
    await refresh($)
    return next(suggestion ? { ...e, context: [...(e.context ?? []), suggestion] } : e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    routing.turnStarted(e.turnId, e.text)
    stopGate.turnStarted(e.text)
    trimOutput.noteGoal(e.text)
    return next(e)
  }).catch(($, e, next) => next(e))

  // The main agent ending a turn normally: the completion gate may send it back to verify a claim
  // (Stop's block). Settings Stop hooks beneath decide first; one that blocks is left to stand.
  on('classic.Stop', async ($, e, next) => {
    const ran = await next(e)
    if (e.agent_id || ran.block !== undefined || ran.preventContinuation) return ran
    const note = await stopGate.check(ioOf($), { promptId: e.prompt_id, last: e.last_assistant_message })
    await refresh($) // the gate's call is on the band's tally
    return note ? { ...ran, block: note } : ran
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    // A subagent's steps keep the model its definition names.
    if (e.agentId) return yield* next(e)
    const io = ioOf($)
    await memory.load(io)
    const routed = await routing.step(io, e)
    await refresh($)
    if (!routed) return yield* next(e)
    return yield* next({ ...e, model: routed.model, effort: routed.effort as typeof e.effort })
  }).catch(async function* ($, e, next) {
    return yield* next(e)
  })

  // A setting changed here (the band itself switched on or off) shows at once.
  on('command.run', { command: 'jev-mod' }, async ($, e) => {
    const answer = await command.run(ioOf($), e.args, e.origin)
    await refresh($)
    return answer
  })
    .catch(() => ({ text: 'jev-mod: the command failed before it finished; /jev-mod shows the settings as they are now.' }))

  // /jev-mod's subcommands, features and settings in the typeahead; nothing for any other prompt.
  on('prompt.autocomplete', async ($, e, next) => {
    const mine = command.suggest(e.text, e.cursor, e.token)
    if (!mine.length) return next(e)
    return { suggestions: [...(await next(e)).suggestions, ...mine] }
  }).catch(($, e, next) => next(e))

  // Only the compaction /jev-mod compact queued; /compact and auto-compaction pass untouched.
  on('session.compact', async ($, e, next) => {
    if (!compact.isOurs(e)) return next(e)
    const compacted = await compact.compact(ioOf($), e.messages)
    await refresh($)
    return compacted
  }).catch(($, e, next) => next(e))

  // find-files' own tool: answered here, before the hook below, so screening never reads it as
  // an MCP result. Its answer is always text; a failure says so and points at Glob and Grep.
  on('tool.call', { tool: 'mcp__jev-mod__find_files' }, async ($, e) => {
    const io = ioOf($)
    await memory.load(io)
    const result = await findFiles.find(io, e as unknown as { query?: unknown; path?: unknown; limit?: unknown })
    await refresh($)
    return { result }
  }).catch(() => ({ result: 'find_files failed before it finished; use Glob and Grep.' }))

  // review-triage's tool: answered as find-files' is. A failure still answers full.
  on('tool.call', { tool: 'mcp__jev-mod__review_triage' }, async ($, e) => {
    const io = ioOf($)
    await memory.load(io)
    const result = await reviewTriage.triage(io, e as unknown as { base?: unknown; paths?: unknown; intent?: unknown })
    await refresh($)
    return { result }
  }).catch(() => ({ result: 'verdict: full\ndo the full review; start with these files.\nreasons:\n- review_triage failed before it finished' }))

  // The browse tool: answered here, before the hook below, never calling next. It screens the page
  // text it returns itself; the band shows each step while it runs.
  on('tool.call', { tool: 'mcp__jev-mod__browse' }, async ($, e, next) => {
    const io = ioOf($)
    await memory.load(io)
    const result = await browser.browse(io, e as unknown as Record<string, unknown>, {
      progress: () => refresh($),
      aborted: () => next.signal.aborted,
    })
    await refresh($)
    return { result }
  }).catch(() => ({ result: 'status: failed\nreason: browse failed before it finished; the browser was closed.' }))

  // Screening first, on what the tool returned; then output trimming, on what screening left.
  on('tool.call', async ($, e, next) => {
    const kind = screening.kindOf(e.tool, e as unknown as Record<string, unknown>)
    const trims = trimOutput.wants(e.tool)
    if (!kind && !trims) return next(e)
    let ran: any = await next(e)
    if (ran.deny !== undefined) return ran
    const failed = ran.isError === true
    const io = ioOf($)
    if (kind && !failed && ran.result !== undefined) {
      const result = await screening.filter(io, kind, e.tool, ran.result)
      if (result !== null) ran = { ...ran, result }
    }
    // trim-output: a long Bash output (a failed command's error text included), after screening.
    // A persisted output is read whole from its file, so for a command screening looks at, that
    // text goes through the same screen first.
    if (trims) {
      const command = String((e as { command?: unknown }).command ?? '')
      const screen = kind ? (text: string) => screening.screenWhole(io, text) : undefined
      const given = failed ? (typeof ran.text === 'string' ? ran.text : ran.result) : ran.result
      const result = await trimOutput.trim(io, { command, subagent: Boolean(e.agentId), screen }, given)
      if (result !== null) ran = failed ? failedWith(String(result)) : { ...ran, result }
    }
    await refresh($)
    return ran
  }).catch(($, e, next) => next(e))

  // ── access gate (features/access-gate) and tool-call gate (features/tool-gate) ──
  // At the permission decision, after Claude Code's own verdict (and the rules gate's, beneath).
  // First the access gate: a call that reaches another machine (ssh, a tunnel, a remote database,
  // ...) or reads keys, in a category this session has not allowed, is refused, whatever the
  // verdict was short of a deny: a deny, which no permission mode turns into a run. Deterministic,
  // no decision model. Then the tool-call gate: a consequential call Claude Code would allow may
  // become an ask, with the reason in the dialog. One hook for both (tool.check takes one hook
  // without a matcher), apart from tool.call's (screening, after the result), so the two never
  // touch. A plugin's `$.tool.check` query (no tool_use_id) runs nothing and is not judged. The
  // band is redrawn only when a gate acted: an allowed call costs a read or two of the config.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'deny' || e.tool_use_id === undefined) return verdict
    const io = ioOf($)
    const refused = await accessGate.check(io, e)
    if (refused) {
      await refresh($)
      return refused
    }
    if (verdict.decision !== 'allow') return verdict
    const gate = await toolGate.check(io, e)
    if (!gate) return verdict
    await refresh($)
    return gate
  }).catch(($, e, next) => next(e))
  // ── end access gate and tool-call gate ──

  // ── rules gate (features/rules-gate) ──
  // An edit inside the project that Claude Code would allow or ask about may be refused, with the
  // project rule it breaks as the error the model reads. A deny already made stands, and a plugin's
  // `$.tool.check` query is not judged. Edits outside the project are the tool gate's.
  on('tool.check', { tool: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'] }, async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'deny' || e.tool_use_id === undefined) return verdict
    const gate = await rulesGate.check(ioOf($), e)
    if (!gate) return verdict
    await refresh($)
    return gate
  }).catch(($, e, next) => next(e))
  // ── end rules gate ──

  // The band above the prompt; next(e) (nothing of the mod's) until it has done something.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Read first, even when the band yields: the read subscribes this instance, so the next
    // write (the band switched on, a survey gone) draws it again.
    const features = await read($, band)
    if (!bandOn || e.props.hasSurvey) return next(e)
    const segments = line(features ?? {}, Date.now())
    if (!segments) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        {segments.map(s => <Text color={s.color ? THEME[s.color] : undefined} dimColor={s.dim}>{s.text}</Text>)}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
