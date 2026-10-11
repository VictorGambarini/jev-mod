// find-files' decision-level bench (src/bench/README.md): each query in cases.ts is run through the
// tool's own steps over the synthetic project in cases.ts: git's file list and counts (a small
// fake git answers them), `narrow` (the local ranking), `askAbout` (the cards and the one choice per
// file, in the tool's own batches), `rank` and `render`. What is recorded is the order the tool
// would list the files in, and the order the local ranking alone would.
//
// The swept number is `limit`, how many files the tool returns (the tool has no relevance bar).
// For a limit k, the top k files are the ones returned. Positive = returned; gold = the file
// implements what the query describes. Gold files the local step never offered count as misses.
// A query with no implementing file adds only false positives, so it measures how much noise the
// tool returns when there is nothing to find.

import { scores } from '../../../bench/metrics'
import type { Confusion, DecisionAdapter, Metrics } from '../../../bench/types'
import { feature } from '../../../core/registry'
import type { IO } from '../../../core/io'
import { askAbout, grepCounts, list, narrow } from '../index'
import { rank, render, termsOf } from '../rank'
import { FILES, QUERIES, ROOT, type FileQuery } from './cases'

const knobs = feature('find-files')!.knobs
const LIMIT = (knobs.limit as { default: number }).default
const MAX_CANDIDATES = (knobs.maxCandidates as { default: number }).default

/** The most files one reply lists, as the tool allows (SPEC's `limit` maximum). */
const MOST = 50

/** The few things of an IO that listing, counting and reading use, answered from the synthetic project like git would. */
function projectIo(): IO {
  const paths = Object.keys(FILES)
  return {
    readFile: async (path: string) => {
      const text = FILES[path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : path]
      if (text === undefined) throw new Error('ENOENT')
      return text
    },
    run: async (argv: string[]) => {
      if (argv[0] !== 'git') return { exitCode: 127, stdout: '', stderr: 'not found' }
      if (argv[3] === 'ls-files') return { exitCode: 0, stdout: `${paths.join('\0')}\0`, stderr: '' }
      if (argv[3] === 'grep') {
        const terms = argv.filter((_, i) => argv[i - 1] === '-e').map(t => t.toLowerCase())
        const lines = paths.map(p => [p, FILES[p]!.split('\n').filter(l => terms.some(t => l.toLowerCase().includes(t))).length] as const)
          .filter(([, n]) => n > 0).map(([p, n]) => `${p}:${n}`)
        return { exitCode: lines.length ? 0 : 1, stdout: lines.join('\n'), stderr: '' }
      }
      return { exitCode: 1, stdout: '', stderr: '' }
    },
  } as unknown as IO
}

/** The paths a reply lists, in order. */
const listed = (reply: string) => [...reply.matchAll(/^\d+\. (\S+) \[/gm)].map(m => m[1]!)

type Recorded = { gold: string[]; shown: string[]; local: string[]; candidates: string[]; searched: number }

/** Confusion over one query's top k, added into the totals; tn counts the candidates neither returned nor gold. */
function add(total: Confusion, shown: readonly string[], d: Recorded, k: number): void {
  const top = shown.slice(0, k)
  const hit = top.filter(p => d.gold.includes(p)).length
  const goldOffered = d.candidates.filter(p => d.gold.includes(p)).length
  total.tp += hit
  total.fp += top.length - hit
  total.fn += d.gold.length - hit
  total.tn += d.candidates.length - top.length - (goldOffered - hit)
}

const share = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : 0)

export const adapter: DecisionAdapter<FileQuery> = {
  feature: 'find-files',
  title: 'find-files',
  effect: 'candidates returned',
  threshold: {
    name: 'limit', default: LIMIT, from: 1, to: 20, step: 1, safer: 'lower',
    saferMeans: 'a lower limit returns fewer files for the model to open and read; the cost is a miss when the right file ranks below it',
    where: { knob: { feature: 'find-files', name: 'limit' } },
    note: 'find-files has no relevance bar: the number of files it returns is the one setting that decides what the model sees. The swept number is that count',
  },
  // Most queries have one implementing file, so F1 would always favour a limit of 1; a missed file costs the model more than an extra one to skip, so recall counts double.
  objective: { label: 'peak F2 (recall counts double)', score: m => (m.precision === null || m.recall === null || m.precision + m.recall === 0 ? 0 : (5 * m.precision * m.recall) / (4 * m.precision + m.recall)) },
  cases: () => QUERIES,
  caseId: q => q.id,
  async judge(q, ctx) {
    const io = projectIo()
    const maxCandidates = Math.max(LIMIT, typeof ctx.settings.maxCandidates === 'number' ? ctx.settings.maxCandidates : MAX_CANDIDATES)
    const terms = termsOf(q.query)
    const listing = await list(io, ROOT)
    const counts = listing.git ? await grepCounts(io, ROOT, terms) : null
    const candidates = await narrow(io, ROOT, listing.files, terms, maxCandidates, counts)
    const asked = await askAbout(ctx.host, undefined, q.query, candidates, terms, ctx.timeoutMs)
    if (!asked.answers.size && candidates.length) return { items: [], calls: asked.calls, errors: asked.errors.length ? asked.errors : ['no_answer'] }
    const outcome = { by: 'jev' as const, searched: listing.files.length, folder: ROOT }
    const ranked = rank(candidates, asked.answers, terms)
    const shown = listed(render(q.query, ranked, MOST, outcome))
    const local = listed(render(q.query, rank(candidates, new Map(), terms), MOST, { ...outcome, by: 'local' }))
    const relevance = new Map(ranked.map(r => [r.path, r.relevance]))
    const detail: Recorded = { gold: q.implements, shown, local, candidates: candidates.map(c => c.path), searched: listing.files.length }
    return {
      items: shown.map(path => ({ id: path, gold: q.implements.includes(path), score: relevance.get(path) ?? null })),
      detail, calls: asked.calls, errors: asked.errors,
    }
  },
  truth(q, state, question) {
    const files = (state.files ?? {}) as Record<string, string>
    const card = files[`F${question.slice(1)}`] ?? ''
    const path = /^path: (.+)$/m.exec(card)?.[1]
    if (!path) return undefined
    return q.implements.includes(path) ? 'implements' : (q.related ?? []).includes(path) ? 'related' : 'unrelated'
  },
  evaluate(rows, threshold): Metrics {
    const ok = rows.filter(r => r.outcome === 'ok' && r.detail)
    const total: Confusion = { tp: 0, fp: 0, tn: 0, fn: 0 }
    const local: Confusion = { tp: 0, fp: 0, tn: 0, fn: 0 }
    let withGold = 0, found = 0, missedLocally = 0, golds = 0
    for (const r of ok) {
      const d = r.detail as unknown as Recorded
      add(total, d.shown, d, threshold)
      add(local, d.local, d, threshold)
      golds += d.gold.length
      missedLocally += d.gold.filter(p => !d.candidates.includes(p)).length
      if (d.gold.length) {
        withGold++
        if (d.shown.slice(0, threshold).some(p => d.gold.includes(p))) found++
      }
    }
    const all = total.tp + total.fp + total.tn + total.fn
    const localF1 = scores(local).f1
    return {
      ...total, ...scores(total), effect: all ? (total.tp + total.fp) / all : 0, cases: ok.length,
      extra: { 'queries with a hit': share(found, withGold), 'local-only F1': localF1 === null ? 0 : Math.round(localF1 * 1000) / 1000, 'gold the local step missed': share(missedLocally, golds) },
    }
  },
}
