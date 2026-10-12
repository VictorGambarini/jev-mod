// The command line of run.ts, parsed: pure, so it can be tested (run.ts itself runs on import).

import { parseSweep, type Sweep } from './metrics'
import type { Setting } from './types'

/** How many times each case × arm runs: a whole number from 1 to 20. */
export function parseRepeat(v: string): number {
  const n = Number(v)
  if (!/^\d+$/.test(v.trim()) || !Number.isInteger(n) || n < 1 || n > 20) throw new Error(`--repeat takes a whole number from 1 to 20, not ${JSON.stringify(v)}`)
  return n
}

export type Args = { feature: string; level: 'decision' | 'task'; backends: string[]; sweep: Sweep | null; settings: Record<string, Setting>;
  cases: string[] | null; timeoutMs: number; yes: boolean; usdPerCall: number | null; maxUsdPerCall: number | null; claudeArgs: string[]
  /** Runs of each case × arm, task level only (`--repeat`). */
  repeat: number }

export function parseArgs(argv: string[]): Args {
  const a: Args = { feature: '', level: 'decision', backends: [], sweep: null, settings: {}, cases: null, timeoutMs: 20_000,
    yes: false, repeat: 1, usdPerCall: null, maxUsdPerCall: null, claudeArgs: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const value = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${arg} needs a value`)
      return v
    }
    if (arg === '--level') { const v = value(); if (v !== 'decision' && v !== 'task') throw new Error('--level is decision or task'); a.level = v }
    else if (arg === '--backend') a.backends.push(...value().split(',').map(s => s.trim()).filter(Boolean))
    else if (arg === '--sweep') a.sweep = parseSweep(value())
    else if (arg === '--set') {
      const [k, ...rest] = value().split('=')
      const v = rest.join('=')
      a.settings[k!] = v === 'true' ? true : v === 'false' ? false : Number.isFinite(Number(v)) && v !== '' ? Number(v) : v
    }
    else if (arg === '--cases') a.cases = value().split(',').map(s => s.trim())
    else if (arg === '--timeout') a.timeoutMs = Number(value())
    else if (arg === '--yes') a.yes = true
    else if (arg === '--repeat') a.repeat = parseRepeat(value())
    else if (arg === '--usd-per-call') a.usdPerCall = Number(value())
    else if (arg === '--max-usd-per-call') a.maxUsdPerCall = Number(value())
    else if (arg === '--claude-arg') a.claudeArgs.push(value())
    else if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`)
    else if (!a.feature) a.feature = arg
    else throw new Error(`unexpected ${arg}`)
  }
  if (!a.feature) throw new Error('name a feature')
  if (!a.backends.length) throw new Error('name a backend with --backend (fake to try it)')
  if (a.repeat > 1 && a.level !== 'task') throw new Error('--repeat is for the task level: a decision-level sweep is replayed from one pass')
  return a
}
