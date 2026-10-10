// Result rows to and from JSONL, and the check that nothing secret is ever written: no field
// named like a key or a header, and no text value the privacy rules would mask (a token, a bearer
// credential, a key's shape). The run's own stamps (git sha, run id, date) are not text. Pure; results.test.ts.

import { redactSecretValues } from '../engine/privacy'
import type { Row } from './types'

const SECRET_FIELD = /api[_-]?key|secret|password|passwd|authori[sz]ation|bearer|credential|cookie|header|(^|[_-])(key|token)$|^(key|token)/i

const STAMPS = new Set(['git', 'run', 'date'])

/** Why a row may not be written, or null when it may. */
export function unsafe(row: unknown): string | null {
  const walk = (value: unknown, path: string, depth: number): string | null => {
    if (typeof value === 'string') return redactSecretValues(value, Number.POSITIVE_INFINITY) !== value ? `${path.slice(0, -1)} looks like a secret` : null
    if (depth > 12 || value === null || typeof value !== 'object') return null
    for (const [name, inner] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELD.test(name)) return `field ${path}${name} is named like a secret`
      if (depth === 0 && STAMPS.has(name)) continue
      const found = walk(inner, `${path}${name}.`, depth + 1)
      if (found) return found
    }
    return null
  }
  return walk(row, '', 0)
}

/** One row as one JSONL line; throws when the row holds anything secret-shaped. */
export function toLine(row: Row): string {
  const why = unsafe(row)
  if (why) throw new Error(`refusing to write a result row for ${row.feature}/${row.case}: ${why}`)
  return JSON.stringify(row)
}

/** The rows of a JSONL text; lines that are not rows are passed over and counted. */
export function fromLines(text: string): { rows: Row[]; skipped: number } {
  const rows: Row[] = []
  let skipped = 0
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line) as Row
      if (row && row.schema === 1 && typeof row.feature === 'string' && typeof row.case === 'string') rows.push(row)
      else skipped++
    } catch {
      skipped++
    }
  }
  return { rows, skipped }
}

/** A file name for a run: date, level, backend, and "fake" for a fake backend. */
export function fileName(date: string, level: string, backend: string, fake: boolean): string {
  const stamp = date.replace(/[:.]/g, '-').replace(/Z$/, '')
  const safe = backend.replace(/[^a-z0-9-]/gi, '_')
  return fake ? `${level}-${safe}-${stamp}.fake.jsonl` : `${level}-${safe}-${stamp}.jsonl`
}
