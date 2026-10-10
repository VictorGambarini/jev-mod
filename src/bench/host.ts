// The client's Host for a real bench run, and how `--backend <name>` picks a backend.
//
// The bench never reads a key. It sets JEV_BACKEND (and JEV_PROVIDER for a provider) for its own
// Host and lets engine/client.ts find the key as the mod does: the key's environment variable,
// the OS secret store, or jev-skills' 0600 file. One place the mod looks is out of reach here: the
// key kept in Claude Code's plugin settings, which only a running session is handed. With only
// that key, export it for the run (`TYPESAFE_API_KEY=... bun src/bench/run.ts ...`) or store it
// with `jev setup-key`.

import { BackendError, readFile as readBackends, active } from '../engine/backends'
import { DEFAULT_MODEL, OPENROUTER_MODEL, VENICE_MODEL, ZEN_MODEL, type Host } from '../engine/client'
import { backendsPath, PROVIDERS, keySource, backendKeySource, type Provider } from '../engine/keys'
import { AbortCtl, fetchFn, fs, proc, run } from './node'
import type { BackendRef } from './types'

const PROVIDER_MODEL: Record<Provider, string> = { typesafe: DEFAULT_MODEL, openrouter: OPENROUTER_MODEL, venice: VENICE_MODEL, zen: ZEN_MODEL }

/** A Host over this process: its environment (with `overrides` on top), files, the OS secret store, fetch. */
export function benchHost(overrides: Record<string, string>): Host {
  const secrets = new Map<string, string | undefined>()
  return {
    env: async name => (name in overrides ? overrides[name] : proc.env[name]),
    readFile: async path => { try { return await (await fs()).readFile(path, 'utf8') } catch { return undefined } },
    // The same two stores core/host.ts asks; the value goes only to the client's request.
    secret: async (service, account) => {
      const id = `${service}\u0000${account}`
      if (secrets.has(id)) return secrets.get(id)
      let value: string | undefined
      for (const [cmd, ...args] of [['/usr/bin/security', 'find-generic-password', '-w', '-s', service, '-a', account],
        ['secret-tool', 'lookup', 'service', service, 'account', account]]) {
        const ran = await run(cmd!, args, { timeoutMs: 8000 })
        if (ran.code === 0 && ran.stdout.trim()) { value = ran.stdout.trim(); break }
      }
      secrets.set(id, value)
      return value
    },
    home: async () => proc.env.HOME ?? '',
    now: () => Date.now(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    post: async (url, body, headers, timeoutMs) => {
      const abort = new AbortCtl()
      const timer = setTimeout(() => abort.abort(), timeoutMs)
      try {
        const reply = await fetchFn(url, { method: 'POST', headers, body, signal: abort.signal })
        const out: Record<string, string> = {}
        reply.headers.forEach((value, key) => { out[key] = value })
        return { status: reply.status, text: await reply.text(), headers: out }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

declare function clearTimeout(handle: unknown): void

/**
 * What `--backend <name>` means, checked before anything is sent: a provider this machine has a
 * key for, a backend backends.json defines, or `default` (whatever the mod would use). The
 * answer names where the key comes from, never the key.
 */
export async function chooseBackend(name: string): Promise<{ ref: BackendRef; host: Host; keyFrom: string }> {
  if ((PROVIDERS as readonly string[]).includes(name)) {
    const host = benchHost({ JEV_BACKEND: name, JEV_PROVIDER: name })
    const from = await keySource(host, name as Provider)
    if (from === 'none') {
      throw new Error(`no key for ${name} where the bench can see it (its environment variable, the OS secret store, or jev's credentials file); ` +
        'a key kept only in Claude Code\'s plugin settings is not handed to the bench')
    }
    return { ref: { name, kind: 'provider', model: (await host.env('TYPESAFE_MODEL')) || PROVIDER_MODEL[name as Provider] }, host, keyFrom: from }
  }
  if (name === 'default') {
    const host = benchHost({})
    return { ref: { name, kind: 'default', model: null }, host, keyFrom: 'as the mod finds it' }
  }
  const host = benchHost({ JEV_BACKEND: name })
  const path = await backendsPath(host)
  let backend
  try {
    const text = await host.readFile(path)
    backend = active(name, () => readBackends(text, path), path)
  } catch (error) {
    if (error instanceof BackendError) throw new Error(error.message)
    throw error
  }
  if (!backend) throw new Error(`${name} is not a backend in ${path}`)
  const from = await backendKeySource(host, backend)
  return { ref: { name, kind: 'named', model: (await host.env('JEV_MODEL')) || backend.model }, host, keyFrom: from === 'none' ? 'none (sent without one)' : from }
}
