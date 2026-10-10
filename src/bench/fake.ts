// A fake decision backend, for trying the bench without a key and for its tests. It is a Host
// whose POST answers like a systemone server, from the case's gold labels with deterministic
// noise: most answers lean the right way with varied confidence, about one in seven leans the
// wrong way. Its numbers say nothing about any model: every row it answers is marked fake, and
// its results and plots go to bench/fake/, never results/.

import type { Host } from '../engine/client'

// The client picks the fake the way it picks any named backend: JEV_BACKEND names it, and the
// backends.json it reads (JEV_BACKENDS) defines it on a port nothing listens on.
const BACKENDS_PATH = '/nonexistent/fake-backends.json'
const BACKENDS_FILE = JSON.stringify({ backends: { fake: { url: 'http://127.0.0.1:9/v1/systemone', model: 'fake-jev' } } })
const ENV: Record<string, string> = { JEV_BACKEND: 'fake', JEV_BACKENDS: BACKENDS_PATH }

/** The right answer to one question of a request: true/false for a yes/no, an option's name for a choice. */
export type Truth = (state: Record<string, unknown>, question: string) => boolean | string | undefined

/** A number in [0, 1) from a string: FNV-1a, so a run is the same every time. */
export function unitHash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h / 2 ** 32
}

/** The probability the fake gives the right side: usually 0.55-0.99, wrong-leaning (0.05-0.45) for about 15%. */
export function fakeLean(key: string, wrongShare = 0.15): number {
  const flip = unitHash(`flip:${key}`) < wrongShare
  const u = unitHash(`conf:${key}`)
  return flip ? 0.05 + 0.4 * u : 0.55 + 0.44 * u
}

type Q = { type: string; criteria?: unknown }

/** The fake's answer to one question. */
export function fakeAnswer(q: Q, right: boolean | string | undefined, key: string): Record<string, unknown> {
  const lean = fakeLean(key)
  if (q.type === 'noul') {
    const yes = right === undefined ? 0.5 : right === true || right === 'true' ? lean : 1 - lean
    return { type: 'noul', noul: Math.round(yes * 1e4) / 1e4 }
  }
  if (q.type === 'choice') {
    const options = Object.keys((q.criteria ?? {}) as Record<string, unknown>)
    const target = typeof right === 'string' && options.includes(right) ? right : options[0]!
    const rest = options.filter(o => o !== target)
    const probabilities: Record<string, number> = { [target]: Math.round(lean * 1e4) / 1e4 }
    const share = (1 - probabilities[target]!) / rest.length
    rest.forEach(o => { probabilities[o] = Math.round(share * 1e4) / 1e4 })
    const fix = 1 - Object.values(probabilities).reduce((a, b) => a + b, 0)
    probabilities[rest[0] ?? target] = Math.round((probabilities[rest[0] ?? target]! + fix) * 1e4) / 1e4
    const choice = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]![0]
    return { type: 'choice', choice, probabilities }
  }
  // a score: the middle level, flat; no adapter asks one yet
  const levels = Array.isArray(q.criteria) ? q.criteria.length : 2
  return { type: 'score', score: (levels - 1) / 2 }
}

/**
 * A Host whose every POST is answered by the fake, with a clock that moves 60-400 ms per call so
 * latencies have a shape. It has no environment, files or secrets: no key is ever looked up.
 */
export function fakeHost(truth: Truth, seed = 'fake'): Host & { posts: number } {
  let clock = 1_700_000_000_000
  const host = {
    posts: 0,
    env: async (name: string) => ENV[name],
    readFile: async (path: string) => (path === BACKENDS_PATH ? BACKENDS_FILE : undefined),
    secret: async () => undefined,
    home: async () => '/nonexistent',
    now: () => clock,
    sleep: async (ms: number) => { clock += ms },
    post: async (_url: string, body: string) => {
      host.posts++
      const request = JSON.parse(body) as { state: unknown; questions: Record<string, Q> }
      const state = (typeof request.state === 'object' && request.state ? request.state : {}) as Record<string, unknown>
      const stateKey = String(unitHash(JSON.stringify(request.state)))
      const answers = Object.fromEntries(Object.entries(request.questions).map(([name, q]) =>
        [name, fakeAnswer(q, truth(state, name), `${seed}:${stateKey}:${name}`)]))
      clock += 60 + Math.round(340 * unitHash(`lat:${seed}:${stateKey}`))
      return { status: 200, text: JSON.stringify({ answers, model: 'fake-jev', usage: { input_tokens: Math.ceil(body.length / 4) } }), headers: {} }
    },
  }
  return host
}
