import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { BandFeatures } from '../types'
import { line } from './features/band/line'
import { modeOf } from './core/config'
import type { IO } from './core/io'
import * as memory from './core/memory'
import * as command from './features/command'
import * as compact from './features/compact'
import * as routing from './features/routing'
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
// Code would have sent it.

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

/** Whether the band is drawn: read from the config when an event comes, not on every draw. */
let bandOn = true

/** Redraw the band from the session's record, after a hook that may have changed it. */
async function refresh($: any): Promise<void> {
  try {
    bandOn = await modeOf(ioOf($), 'band') !== 'off'
    await update($, band, () => memory.snapshot())
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
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    status: text => $.ui.status(text),
    toast: text => $.ui.toast(text),
    runCommand: (command, args) => $.command.run({ command, args }),
    after: (ms, fn) => { $.clock.after(ms, fn) },
  }
}

// A change in /config, or a key set in the plugin's settings, reloads this module with the new options.
export const register: Register = (on, given) => {
  options = { ...(given ?? {}) }
  on('session.start', async ($, e, next) => {
    await $.command.register(command.command)
    return next(e)
  })

  // Each feature's look at the prompt, all at once: the prompt waits for the slowest, not the sum.
  on('prompt.submit', async ($, e, next) => {
    const text = e.text
    if (!text.trim() || text.trimStart().startsWith('/')) return next(e)
    const io = ioOf($)
    await memory.load(io)
    const [suggestion] = await Promise.all([skills.analyse(io, text), routing.analyse(io, text), toolGate.analyse(io, text)])
    await refresh($)
    return next(suggestion ? { ...e, context: [...(e.context ?? []), suggestion] } : e)
  })

  on('turn.start', async ($, e, next) => {
    routing.turnStarted(e.turnId, e.text)
    stopGate.turnStarted(e.text)
    trimOutput.noteGoal(e.text)
    return next(e)
  })

  // The main agent ending a turn normally: the completion gate may send it back to verify a claim
  // (Stop's block). Settings Stop hooks beneath decide first; one that blocks is left to stand.
  on('classic.Stop', async ($, e, next) => {
    const ran = await next(e)
    if (e.agent_id || ran.block !== undefined || ran.preventContinuation) return ran
    const note = await stopGate.check(ioOf($), { promptId: e.prompt_id, last: e.last_assistant_message })
    return note ? { ...ran, block: note } : ran
  })

  on('turn.step', async function* ($, e, next) {
    // A subagent's steps keep the model its definition names.
    if (e.agentId) return yield* next(e)
    const io = ioOf($)
    await memory.load(io)
    const routed = await routing.step(io, e)
    await refresh($)
    if (!routed) return yield* next(e)
    return yield* next({ ...e, model: routed.model, effort: routed.effort as typeof e.effort })
  })

  on('command.run', { command: 'jev-mod' }, async ($, e) => command.run(ioOf($), e.args))

  // /jev-mod's subcommands, features and settings in the typeahead; nothing for any other prompt.
  on('prompt.autocomplete', async ($, e, next) => {
    const mine = command.suggest(e.text, e.cursor, e.token)
    if (!mine.length) return next(e)
    return { suggestions: [...(await next(e)).suggestions, ...mine] }
  })

  // Only the compaction /jev-mod compact queued; /compact and auto-compaction pass untouched.
  on('session.compact', async ($, e, next) => {
    if (!compact.isOurs(e)) return next(e)
    return compact.compact(ioOf($), e.messages)
  })

  // Screening first, on what the tool returned; then output trimming, on what screening left.
  on('tool.call', async ($, e, next) => {
    const kind = screening.kindOf(e.tool, e as unknown as Record<string, unknown>)
    const trims = trimOutput.wants(e.tool)
    if (!kind && !trims) return next(e)
    let ran: any = await next(e)
    if (ran.deny !== undefined || ran.result === undefined) return ran
    if (kind && !ran.isError) {
      const result = await screening.filter(ioOf($), kind, e.tool, ran.result)
      if (result !== null) ran = { ...ran, result }
    }
    // trim-output: a long Bash output (a failed command's included), after screening
    if (trims) {
      const command = String((e as { command?: unknown }).command ?? '')
      const result = await trimOutput.trim(ioOf($), { command, subagent: Boolean(e.agentId) }, ran.result)
      if (result !== null) ran = { ...ran, result }
    }
    await refresh($)
    return ran
  })

  // ── tool-call gate (features/tool-gate) ──
  // At the permission decision, after Claude Code's own verdict: a consequential call it would
  // allow may become an ask, with the reason in the dialog; nothing else changes. Its own hook,
  // apart from tool.call's (screening, after the result), so the two never touch. A plugin's
  // `$.tool.check` query (no tool_use_id) runs nothing and is not judged.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision !== 'allow' || e.tool_use_id === undefined) return verdict
    const io = ioOf($)
    await memory.load(io)
    const gate = await toolGate.check(io, e)
    await refresh($)
    return gate ?? verdict
  })
  // ── end tool-call gate ──

  // The band above the prompt; next(e) (nothing of the mod's) until it has done something.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!bandOn || e.props.hasSurvey) return next(e)
    const features = await read($, band)
    const segments = features ? line(features, Date.now()) : null
    if (!segments) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        {segments.map(s => <Text color={s.color ? THEME[s.color] : undefined} dimColor={s.dim}>{s.text}</Text>)}
      </Box>
    )
  })
}
