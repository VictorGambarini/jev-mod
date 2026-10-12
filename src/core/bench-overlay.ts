import type { IO } from './io'
import { readOnce } from './reads'

// A settings overlay for benchmark runs, and nothing else. The bench (src/bench/) starts a
// headless `claude -p` with JEV_MOD_BENCH_OVERLAY naming a JSON file, so one run can set a
// feature's mode and knobs without the person's ~/.config/jev-mod/config.json being touched:
//
//   {"features": {"trim-output": {"mode": "on", "keepThreshold": 0.4}, "routing": {"mode": "off"}},
//    "compact": {"dropConfidence": 0.8},
//    "ledger": "/tmp/bench/run-12/ledger"}
//
// It sits above the user's and the project's files and below what the person locked: a kill file
// and "jev-mod on" unticked in /config still win (config.ts). For a protective feature (screening,
// the gates) it may only make the mode stricter, and for a risky one (the browser) only lower;
// neither takes its knobs from here. The one exception is LOOPBACK_ON: a bench overlay may turn
// the browser on, and it then reaches this machine's loopback hosts only (browser/index.ts
// refuses any other startUrl or allowHosts, and attaching), so a bench can drive its own local
// test sites and nothing on the web. An arm that runs a feature with every other one off, the
// protective ones too (the browser's bare arm), does not get that from here: it gets a scratch
// config folder of its own (src/bench/bare.ts). `compact.dropConfidence` is how sure a drop, or a trim, must be
// for /jev-mod compact to act on it (the default is engine/compact.ts's DROP_CONFIDENCE). `ledger`
// is a folder where each decision call's cost is written, one small file per call, for the
// bench to add up, where /jev-mod compact writes what each compaction kept, dropped and trimmed, and under
// which (compact-files/) it saves the tool results it trimmed. An overlay holding anything
// key-shaped (a field named like a key, token, secret, password or header) is refused whole: a
// key never travels in it.

export const OVERLAY_ENV = 'JEV_MOD_BENCH_OVERLAY'
/** Risky features a bench overlay may turn on, which then reach loopback hosts only (see above). */
export const LOOPBACK_ON: readonly string[] = ['browser']
/** The hosts a feature turned on by a bench overlay may reach. */
export const LOOPBACK_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', '[::1]']
export const DROP_CONFIDENCE_RANGE: [number, number] = [0.5, 0.99]

export type Overlay = {
  features: Record<string, Record<string, unknown>>
  compact?: { dropConfidence?: number }
  ledger?: string
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const KEYISH = /api[_-]?key|secret|password|passwd|authori[sz]ation|bearer|credential|cookie|header|(^|[_-])(key|token)$|^(key|token)/i

/** The first field name anywhere in `value` that looks like it holds a secret, or null. */
function keyish(value: unknown, depth = 0): string | null {
  if (depth > 6 || !value || typeof value !== 'object') return null
  for (const [name, inner] of Object.entries(value as Record<string, unknown>)) {
    if (KEYISH.test(name)) return name
    const found = keyish(inner, depth + 1)
    if (found) return found
  }
  return null
}

/** The overlay a file's text holds, or why it is passed over. Feature sections are checked by config.ts. */
export function parseOverlay(text: string): { overlay: Overlay } | { problem: string } {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { problem: 'bench overlay is not JSON; it is passed over' } }
  if (!isObject(raw)) return { problem: 'bench overlay must be a JSON object; it is passed over' }
  const named = keyish(raw)
  if (named) return { problem: `bench overlay has a field named ${JSON.stringify(named)}; a key never goes in it, so it is passed over` }
  const overlay: Overlay = { features: {} }
  if (raw.features !== undefined) {
    if (!isObject(raw.features)) return { problem: 'bench overlay: "features" must be an object; it is passed over' }
    for (const [id, section] of Object.entries(raw.features)) if (isObject(section)) overlay.features[id] = section
  }
  if (isObject(raw.compact)) {
    const d = raw.compact.dropConfidence
    const [low, high] = DROP_CONFIDENCE_RANGE
    if (typeof d === 'number' && Number.isFinite(d) && d >= low && d <= high) overlay.compact = { dropConfidence: d }
  }
  if (typeof raw.ledger === 'string' && raw.ledger.startsWith('/')) overlay.ledger = raw.ledger.replace(/\/+$/, '')
  return { overlay }
}

/** The overlay JEV_MOD_BENCH_OVERLAY names, if any; a problem when it is named but unusable. */
export async function readOverlay(io: IO): Promise<{ overlay?: Overlay; problem?: string }> {
  const path = ((await io.env(OVERLAY_ENV)) ?? '').trim()
  if (!path) return {}
  const text = await readOnce(io, path)
  if (text === undefined) return { problem: `bench overlay ${path} could not be read; it is passed over` }
  const parsed = parseOverlay(text)
  return 'overlay' in parsed ? { overlay: parsed.overlay } : { problem: parsed.problem }
}

/** /jev-mod compact's drop confidence when a bench overlay sets one. */
export async function dropConfidence(io: IO): Promise<number | undefined> {
  try { return (await readOverlay(io)).overlay?.compact?.dropConfidence } catch { return undefined }
}

/** The overlay's ledger folder, when a bench run names one: /jev-mod compact saves its files under it. */
export async function benchLedger(io: IO): Promise<string | undefined> {
  try { return (await readOverlay(io)).overlay?.ledger } catch { return undefined }
}

/** Write one decision call's cost to the overlay's ledger folder, when it names one. Never throws. */
export async function ledger(io: IO, entry: { feature?: string; calls: number; cost: number; model?: string | null; error: string | null }): Promise<void> {
  try {
    const folder = (await readOverlay(io)).overlay?.ledger
    if (!folder) return
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`
    await io.writeFile(`${folder}/${name}`, JSON.stringify({ at: Date.now(), feature: entry.feature ?? null, calls: entry.calls,
      cost: entry.cost, model: entry.model ?? null, error: entry.error }))
  } catch { /* the ledger is the bench's; a decision never fails for it */ }
}

/**
 * Write what one /jev-mod compaction did (messages before, kept, dropped; tool results trimmed,
 * the characters that took out, and the files saved; why nothing went when nothing did) to the
 * overlay's ledger folder, when it names one: the bench's proof that a compaction happened.
 * Never throws.
 */
export async function ledgerCompaction(io: IO, entry: { messages: number; kept: number; dropped: number; skip: string | null;
  trimmed?: number; charsRemoved?: number; files?: number }): Promise<void> {
  try {
    const folder = (await readOverlay(io)).overlay?.ledger
    if (!folder) return
    const name = `compaction-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`
    await io.writeFile(`${folder}/${name}`, JSON.stringify({ at: Date.now(), kind: 'compaction', messages: entry.messages,
      kept: entry.kept, dropped: entry.dropped, trimmed: entry.trimmed ?? 0, charsRemoved: entry.charsRemoved ?? 0,
      files: entry.files ?? 0, skip: entry.skip }))
  } catch { /* the ledger is the bench's; a compaction never fails for it */ }
}
