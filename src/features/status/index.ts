import { hostOf } from '../../core/host'
import type { IO } from '../../core/io'
import { recordCalls } from '../../core/jev'
import { problems, resolve, snapshot } from '../../core/config'
import { FEATURES } from '../../core/registry'
import { isPrivate, jevDir } from '../../core/settings'
import { BackendError } from '../../engine/backends'
import { activeBackend, ask, costOf, JevError, noul, type Asked } from '../../engine/client'
import { backendKey, backendKeySource, keySource, provider, providerKey } from '../../engine/keys'
import { limitConfig } from '../../engine/lanes'
import { VERSION } from '../../version'
import { report, scrub, type Facts } from './report'

// /jev-status: which decision backend the mod uses, where its key came from (never the key),
// one check call with jev-skills' own verification question, each feature's mode and today's spend.

export const command = {
  name: 'jev-status',
  description: "Show jev-mod's decision backend, where its key comes from, a live check, and its switches",
}

async function readJson(io: IO, path: string): Promise<any> {
  try { return JSON.parse(await io.readFile(path)) } catch { return undefined }
}

export async function run(io: IO): Promise<{ text: string }> {
  const host = hostOf(io)
  const dir = await jevDir(io)
  let backend = null
  let misconfigured: string | null = null
  try {
    backend = await activeBackend(host)
  } catch (error) {
    misconfigured = error instanceof BackendError ? error.message : String(error)
  }
  const chosen = await provider(host)
  const snap = await snapshot(io)
  const gateway = ((await io.env('TYPESAFE_BASE_URL')) ?? '').trim().replace(/\/+$/, '')
  const facts: Facts = {
    version: VERSION,
    backend: backend ? { name: backend.name, model: backend.model, url: backend.url } : null,
    provider: chosen,
    keySource: backend ? await backendKeySource(host, backend) : chosen === 'absent' ? 'none' : await keySource(host, chosen),
    gateway: gateway && gateway !== 'https://api.typesafe.ai' ? gateway : null,
    misconfigured,
    check: null,
    features: FEATURES.map(f => ({ id: f.id, ...resolve(snap, f) })),
    private: await isPrivate(io, dir),
    problems: problems(snap),
    budget: null,
  }
  if (!facts.private) {
    const started = Date.now()
    try {
      const reply: Asked = await ask(host, 'The build finished and all tests passed.',
        { ok: noul('The text reports a successful outcome') }, { timeoutMs: 15_000 })
      facts.check = { ok: true, model: reply.jev_model, ms: Date.now() - started, cost: costOf(reply) }
      await recordCalls(io, [reply])
    } catch (error) {
      const code = error instanceof JevError ? error.code : 'error'
      const said = error instanceof JevError ? error.message.replace(new RegExp(`^${code}:? ?`), '') : ''
      facts.check = { ok: false, error: code, said: said.slice(0, 200) }
    }
  }
  const limits = limitConfig(await readJson(io, `${dir}/limits.json`))
  const state = await readJson(io, `${dir}/limits.state.json`)
  const today = new Date()
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  facts.budget = { spent: state?.day === day ? Number(state.usd ?? 0) : 0, daily: limits.daily_usd }
  const keys = [backend ? await backendKey(host, backend) : undefined, chosen !== 'absent' ? await providerKey(host, chosen) : undefined]
  return { text: scrub(report(facts), keys) }
}
