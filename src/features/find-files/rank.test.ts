import { test, expect } from 'claude-code/testing'
import type { Answer } from '../../engine/client'
import {
  BATCH, bodyScore, byScore, cardOf, cardText, headOf, headScore, inside, pack, pathScore, rank, render, request,
  resolvePath, stem, termsOf, UNJUDGED, wanted, wordsOf, type Candidate,
} from './rank'

test('words: camelCase, snake_case, kebab-case and paths come apart, lowercased', () => {
  expect(wordsOf('parseHTTPResponse snake_case kebab-case src/coreIO.ts')).toEqual(
    ['parse', 'http', 'response', 'snake', 'case', 'kebab', 'case', 'src', 'core', 'io', 'ts'])
  expect(stem('retries')).toBe('retry')
  expect(stem('compaction')).toBe('compact')
  expect(stem('parsing')).toBe('pars')
  expect(stem('run')).toBe('run') // never below three letters
})

test('terms: stop words and short words go, stems stay, longest first', () => {
  expect(termsOf('Where is the code that handles retries with exponential backoff?')).toEqual(['exponential', 'backoff', 'retry'])
  expect(termsOf('the code')).toEqual([])
  expect(termsOf('compactTranscript')).toEqual(['transcript', 'compact'])
})

test('wanted: binaries, lockfiles and minified files are not scored', () => {
  expect(wanted('src/a.ts')).toBe(true)
  expect(wanted('Makefile')).toBe(true)
  expect(wanted('docs/logo.png')).toBe(false)
  expect(wanted('package-lock.json')).toBe(false)
  expect(wanted('web/vendor.min.js')).toBe(false)
})

test('the path: a match in the file name counts more than one in a folder', () => {
  const terms = termsOf('retry backoff')
  expect(pathScore('src/net/retry.ts', terms)).toBeGreaterThan(pathScore('src/retry/client.ts', terms))
  expect(pathScore('src/net/retry.ts', terms)).toBe(3)
  expect(pathScore('src/retry/client.ts', terms)).toBe(1.5)
  expect(pathScore('src/ui/button.tsx', terms)).toBe(0)
  // camelCase and plural file names still match
  expect(pathScore('src/withRetries.ts', terms)).toBe(3)
})

const SOURCE = `#!/usr/bin/env node
// Retries a request with exponential backoff.
// The delay doubles each time, up to a cap.

import { sleep } from './clock'
import fetch from 'node-fetch'

export async function withBackoff(fn, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try { return await fn() } catch { await sleep(2 ** i * 100) }
  }
}
export const MAX_DELAY = 30_000
class Helper {}
`

test('the head: header comment, defined names and imports', () => {
  const head = headOf(SOURCE)
  expect(head.header).toBe('Retries a request with exponential backoff. The delay doubles each time, up to a cap.')
  expect(head.symbols).toEqual(['withBackoff', 'MAX_DELAY', 'Helper'])
  expect(head.imports).toEqual(['./clock', 'node-fetch'])
  const py = headOf('"""Parse the config file."""\nimport os\nfrom pathlib import Path\n\ndef load_config(path):\n    pass\n')
  expect(py.header).toBe('Parse the config file."""')
  expect(py.symbols).toEqual(['load_config'])
  expect(py.imports).toEqual(['os', 'pathlib'])
})

test('the head score: names and header count more than the rest; nothing without terms', () => {
  const head = headOf(SOURCE)
  expect(headScore(head, termsOf('exponential backoff'))).toBeGreaterThan(headScore(head, termsOf('request delay')) - 0.01)
  expect(headScore(head, termsOf('exponential backoff'))).toBeGreaterThan(3)
  expect(headScore(head, [])).toBe(0)
  expect(headScore(head, termsOf('database migration'))).toBe(0)
})

test('the body score grows with matching lines, slowly, and is capped', () => {
  expect(bodyScore(0)).toBe(0)
  expect(bodyScore(4)).toBeGreaterThan(bodyScore(1))
  expect(bodyScore(10_000)).toBe(3)
})

test('byScore: best first, then the shorter path', () => {
  expect(byScore([{ path: 'a/b/c.ts', score: 1 }, { path: 'x.ts', score: 1 }, { path: 'z.ts', score: 2 }]).map(c => c.path))
    .toEqual(['z.ts', 'x.ts', 'a/b/c.ts'])
})

test('a card: path, header, names and matching lines, capped and redacted', () => {
  const terms = termsOf('exponential backoff')
  const card = cardOf('src/net/retry.ts', headOf(SOURCE), terms)
  expect(card).toContain('path: src/net/retry.ts')
  expect(card).toContain('header: Retries a request with exponential backoff.')
  expect(card).toContain('defines: withBackoff, MAX_DELAY, Helper')
  expect(card).toContain('lines: export async function withBackoff')
  expect(card.length).toBeLessThan(800)
  const secret = `// Talks to the API.\nconst API_KEY = "sk-live-${'a1B2'.repeat(10)}"\nexport function call() {}\n`
  const raw = cardText('src/api.ts', headOf(secret), termsOf('api key call'))
  expect(raw).toContain('sk-live-')
  expect(cardOf('src/api.ts', headOf(secret), termsOf('api key call'))).not.toContain('a1B2a1B2')
})

test('pack: at most BATCH cards a request, every card once, in order', () => {
  const cards = Array.from({ length: 100 }, (_, i) => `path: src/f${i}.ts`)
  const batches = pack(cards)
  expect(batches.length).toBe(3)
  expect(batches.every(b => b.length <= BATCH)).toBe(true)
  expect(batches.flat()).toEqual(cards.map((_, i) => i))
  // big cards are packed by size, not by count
  expect(pack(Array.from({ length: 100 }, () => 'x'.repeat(700))).length).toBeGreaterThan(2)
})

test('a request asks one choice per card against the redacted query', () => {
  const { state, questions } = request('where retries happen', ['path: a.ts', 'path: b.ts', 'path: c.ts'], [0, 2])
  expect(state).toEqual({ query: 'where retries happen', files: { F0: 'path: a.ts', F2: 'path: c.ts' } })
  expect(Object.keys(questions)).toEqual(['f0', 'f2'])
  expect(questions.f2!.type).toBe('choice')
  expect(Object.keys(questions.f2!.criteria as object)).toEqual(['implements', 'related', 'unrelated'])
})

const pick = (choice: string, p: Record<string, number>): Answer => ({ type: 'choice', choice, probabilities: p, confidence: p[choice]! })

test('rank: the verdict orders, the local score breaks ties, the unjudged sit between related and unrelated', () => {
  const candidates: Candidate[] = [
    { path: 'src/a.ts', score: 9 }, // judged unrelated, best local score
    { path: 'src/b.ts', score: 2 }, // implements
    { path: 'src/c.ts', score: 5 }, // related
    { path: 'src/d.ts', score: 4 }, // not judged
    { path: 'src/e.ts', score: 6 }, // implements, same probabilities as b, better local score
  ]
  const answers = new Map<number, Answer>([
    [0, pick('unrelated', { implements: 0.05, related: 0.05, unrelated: 0.9 })],
    [1, pick('implements', { implements: 0.8, related: 0.15, unrelated: 0.05 })],
    [2, pick('related', { implements: 0.1, related: 0.8, unrelated: 0.1 })],
    [4, pick('implements', { implements: 0.8, related: 0.15, unrelated: 0.05 })],
  ])
  const ranked = rank(candidates, answers, termsOf('anything'))
  expect(ranked.map(r => r.path)).toEqual(['src/e.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/a.ts'])
  expect(ranked[3]!.relevance).toBe(UNJUDGED)
  expect(ranked[0]!.verdict).toBe('implements')
  // no answers at all: the local order
  expect(rank(candidates, new Map(), []).map(r => r.path)).toEqual(['src/a.ts', 'src/e.ts', 'src/c.ts', 'src/d.ts', 'src/b.ts'])
})

test('render: says how it was ranked, drops what the model judged unrelated, keeps the limit', () => {
  const candidates: Candidate[] = [{ path: 'src/a.ts', score: 9, head: headOf(SOURCE) }, { path: 'src/b.ts', score: 2 }]
  const answers = new Map<number, Answer>([
    [0, pick('implements', { implements: 0.9, related: 0.05, unrelated: 0.05 })],
    [1, pick('unrelated', { implements: 0.02, related: 0.03, unrelated: 0.95 })],
  ])
  const terms = termsOf('backoff')
  const out = render('backoff', rank(candidates, answers, terms), 10, { by: 'jev', searched: 12, folder: '/p' })
  expect(out.split('\n')).toEqual([
    '1 file for "backoff" in /p, ranked by the decision model; 12 files searched.',
    '1. src/a.ts [implements 0.90] Retries a request with exponential backoff.',
  ])
  const local = render('backoff', rank(candidates, new Map(), terms), 1, { by: 'local', note: 'private mode', searched: 12, folder: '/p' })
  expect(local.split('\n')).toEqual([
    '1 file for "backoff" in /p, local ranking only (private mode); 12 files searched.',
    '1. src/a.ts [score 9.0] Retries a request with exponential backoff.',
  ])
  expect(render('x', [], 5, { by: 'local', searched: 0, folder: '/p' })).toContain('Nothing matched')
})

test('paths: relative to the root, . and .. resolved, and inside the root or not', () => {
  expect(resolvePath('/p/repo', 'src/../lib')).toBe('/p/repo/lib')
  expect(resolvePath('/p/repo', '.')).toBe('/p/repo')
  expect(resolvePath('/p/repo', '/etc')).toBe('/etc')
  expect(inside('/p/repo', '/p/repo')).toBe(true)
  expect(inside('/p/repo', '/p/repo/src')).toBe(true)
  expect(inside('/p/repo', '/p/repository')).toBe(false)
  expect(inside('/p/repo', resolvePath('/p/repo', '../other'))).toBe(false)
})
