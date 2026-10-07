import type { Register } from 'claude-code'
import type { IO } from './core/io'
import * as memory from './core/memory'
import * as compactJev from './features/compact-jev'
import * as routing from './features/routing'
import * as screening from './features/screening'
import * as skills from './features/skills'

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

function ioOf($: any): IO {
  return {
    run: (argv, init) => $.process.run(argv, init),
    fetch: (url, init) => $.http.fetch(url, init),
    readFile: path => $.fs.read(path),
    writeFile: (path, text) => $.fs.write(path, text),
    home: () => $.env.get('HOME'),
    sessionId: () => $.session.id(),
    usage: async () => {
      const { context } = await $.session.usage()
      return { contextTokens: context.tokens ?? 0, contextWindow: context.window, contextPercent: context.percent }
    },
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    status: text => $.ui.status(text),
    toast: text => $.ui.toast(text),
    runCommand: (command, args) => $.command.run({ command, args }),
    after: (ms, fn) => { $.clock.after(ms, fn) },
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register(compactJev.command)
    return next(e)
  })

  // Each feature's look at the prompt, all at once: the prompt waits for the slowest, not the sum.
  on('prompt.submit', async ($, e, next) => {
    const text = e.text
    if (!text.trim() || text.trimStart().startsWith('/')) return next(e)
    const io = ioOf($)
    await memory.load(io)
    const [suggestion] = await Promise.all([skills.analyse(io, text), routing.analyse(io, text)])
    return next(suggestion ? { ...e, context: [...(e.context ?? []), suggestion] } : e)
  })

  on('turn.start', async ($, e, next) => {
    routing.turnStarted(e.turnId, e.text)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // A subagent's steps keep the model its definition names.
    if (e.agentId) return yield* next(e)
    const io = ioOf($)
    await memory.load(io)
    const routed = await routing.step(io, e)
    if (!routed) return yield* next(e)
    return yield* next({ ...e, model: routed.model, effort: routed.effort as typeof e.effort })
  })

  on('command.run', { command: 'compact-jev' }, async $ => compactJev.run(ioOf($)))

  // Only the compaction /compact-jev queued; /compact and auto-compaction pass untouched.
  on('session.compact', async ($, e, next) => {
    if (!compactJev.isOurs(e)) return next(e)
    return compactJev.compact(ioOf($), e.messages)
  })

  on('tool.call', async ($, e, next) => {
    const kind = screening.kindOf(e.tool, e as unknown as Record<string, unknown>)
    if (!kind) return next(e)
    const ran: any = await next(e)
    if (ran.deny !== undefined || ran.isError || ran.result === undefined) return ran
    const result = await screening.filter(ioOf($), kind, e.tool, ran.result)
    return result === null ? ran : { ...ran, result }
  })
}
