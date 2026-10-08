import type { IO } from './io'
import { jevDir } from './settings'
import { admitState, chargeState, limitConfig, type Limits, type LimitState } from '../engine/lanes'

// The daily budget and the per-minute brake on policy decisions, kept where jev-skills keeps
// them (<config>/limits.json, limits.state.json) so the mod and the `jev` command share one
// budget. JEV_LIMITS=off turns them off, as it does there.
//
// Python holds an flock around each read-and-write; a mod cannot, so two processes deciding in
// the same instant may lose one count. limits.py calls itself a brake, not an accountant: it
// admits when the counter cannot be read, and so does this.

async function readJson(io: IO, path: string): Promise<unknown> {
  try { return JSON.parse(await io.readFile(path)) } catch { return undefined }
}

export async function limitsOf(io: IO): Promise<Limits | undefined> {
  const off = ((await io.env('JEV_LIMITS')) ?? '').trim().toLowerCase()
  if (['off', '0', 'false', 'no'].includes(off)) return undefined
  const dir = await jevDir(io)
  const statePath = `${dir}/limits.state.json`
  const state = async (): Promise<LimitState> => {
    const raw = await readJson(io, statePath)
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as LimitState : {}
  }
  const write = async (next: LimitState) => {
    try { await io.writeFile(statePath, JSON.stringify(next)) } catch { /* a brake, not an accountant */ }
  }
  return {
    admit: async shadow => {
      const [allowed, reason, next] = admitState(await state(), limitConfig(await readJson(io, `${dir}/limits.json`)), Date.now(), shadow)
      if (allowed) await write(next)
      return [allowed, reason]
    },
    charge: async usd => {
      if (usd) await write(chargeState(await state(), Date.now(), usd))
    },
  }
}
