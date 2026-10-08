import type { Host } from '../engine/client'
import type { IO } from './io'

// The engine's Host (engine/client.ts) built from the mod's IO: environment, files, the OS
// secret store, one POST with a deadline, the clock.

const SECRET_TTL_MS = 5 * 60_000
const secrets = new Map<string, { value: string | undefined; at: number }>()

/**
 * The OS secret store's value, as jev-skills' keystore reads it: macOS Keychain through
 * `security`, else `secret-tool`. Remembered for five minutes, so a request does not start two
 * processes per provider it checks; a key stored meanwhile is seen within that time.
 */
async function secret(io: IO, service: string, account: string): Promise<string | undefined> {
  const id = `${service}\u0000${account}`
  const known = secrets.get(id)
  if (known && Date.now() - known.at < SECRET_TTL_MS) return known.value
  let value: string | undefined
  for (const argv of [['/usr/bin/security', 'find-generic-password', '-w', '-s', service, '-a', account],
    ['secret-tool', 'lookup', 'service', service, 'account', account]]) {
    try {
      const ran = await io.run(argv, { timeoutMs: 8000 })
      const out = ran.stdout.trim()
      if (ran.exitCode === 0 && out) { value = out; break }
    } catch {
      // not installed here: try the next store
    }
  }
  secrets.set(id, { value, at: Date.now() })
  return value
}

export function hostOf(io: IO): Host {
  return {
    env: name => io.env(name),
    readFile: async path => {
      try { return await io.readFile(path) } catch { return undefined }
    },
    secret: (service, account) => secret(io, service, account),
    setting: async name => { const v = io.option(name); return typeof v === 'string' ? v : undefined },
    home: async () => (await io.home()) ?? '',
    now: () => Date.now(),
    sleep: ms => io.sleep(ms),
    // Claude Code's fetch follows a redirect but drops Authorization when it leaves the origin
    // (checked against a local pair of servers), so a key cannot be carried to another host;
    // a redirected reply then fails to parse and the call fails open.
    post: async (url, body, headers, timeoutMs) => {
      const deadline = io.sleep(timeoutMs).then(() => { throw new Error('timeout') })
      const reply = await Promise.race([io.fetch(url, { method: 'POST', headers, body }), deadline])
      return { status: reply.status, text: reply.text, headers: reply.headers ?? {} }
    },
  }
}
