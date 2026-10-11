// The web filter's decision-level bench (src/bench/README.md): each case in cases.ts is asked as
// the filter asks it, with filter.ts's own functions. A search case is triaged (the first keepTop
// results, copies of a URL and results on a host the request names are never asked), and each
// result left is one yes/no, "does it help"; a fetch case is cut into chunks, the ones kept
// without asking are left out, and each chunk left is one yes/no, "is it needed". The score is
// the chance of "no", which the filter compares to minConfidence (the 0.8). One item per
// question: positive = dropped.

import { ask, JevError } from '../../../engine/client'
import { itemMetrics } from '../../../bench/metrics'
import type { DecisionAdapter } from '../../../bench/types'
import { feature } from '../../../core/registry'
import { isSensitive } from '../../../engine/privacy'
import {
  chunksOf, fetchRequest, hitsOf, mustKeep, namedHosts, searchRequest, termsOf, triage, unitsOf, type Chunk,
} from '../filter'
import { CASES, type FetchCase, type WebCase } from './cases'

const knob = feature('web-filter')!.knobs
const DEFAULT = (knob.minConfidence as { default: number }).default
const KEEP_TOP = (knob.keepTop as { default: number }).default

const textOf = (c: FetchCase) => c.sections.map(s => s.text).join('\n\n')

/** The chunks of a fetch case, and the ones the filter asks about. */
export function fetchPlan(c: FetchCase): { chunks: Chunk[]; ask: number[] } {
  const text = textOf(c)
  const chunks = chunksOf(text, unitsOf(text))
  const terms = termsOf(`${c.prompt}\n${c.request}`)
  return { chunks, ask: chunks.flatMap((k, id) => (mustKeep(k.text, id, terms) === null && !isSensitive(k.text) ? [id] : [])) }
}

/** Characters of a needed section that a chunk must hold for the chunk to count as needed. */
const NEEDED_OVERLAP = 200

/** Whether a chunk is needed: it holds a good part of a needed section (a section may be cut across two chunks). */
export function neededChunk(c: FetchCase, chunk: Chunk): boolean {
  const text = textOf(c)
  const from = text.indexOf(chunk.text)
  const to = from + chunk.text.length
  let at = 0
  for (const s of c.sections) {
    const end = at + s.text.length
    if (s.needed && Math.min(to, end) - Math.max(from, at) >= NEEDED_OVERLAP) return true
    at = end + 2 // the blank line between sections
  }
  return false
}

export const adapter: DecisionAdapter<WebCase> = {
  feature: 'web-filter',
  title: 'Web filter',
  explain: {
    oneCase: "a web search (its results) or a long fetched page (cut into parts), with what the person asked, and for each result or part whether it helps.",
    measured: "whether Jev drops what does not help and keeps what does. A dropped result is gone from what Claude reads, so dropping a useful one is the costly mistake.",
    setting: "how sure Jev must be that a result or part is not needed before it is dropped. Higher drops fewer.",
    result: "Jev keeps or drops the right results and parts on {pct} of the questions over {n} cases",
  },
  effect: 'results and parts dropped',
  threshold: {
    name: 'minConfidence', default: DEFAULT, from: 0.5, to: 0.95, step: 0.05, safer: 'higher',
    saferMeans: 'a higher bar drops fewer results and parts, and a dropped one is gone from what the model reads',
    where: { knob: { feature: 'web-filter', name: 'minConfidence' } },
  },
  cases: () => CASES,
  caseId: c => c.id,
  async judge(c, ctx) {
    const timeoutMs = typeof ctx.settings.timeoutMs === 'number' ? ctx.settings.timeoutMs : ctx.timeoutMs
    try {
      if (c.kind === 'search') {
        const hits = hitsOf(c.hits.map(({ title, url, snippet }) => ({ title, url, snippet })))
        const keepTop = typeof ctx.settings.keepTop === 'number' ? ctx.settings.keepTop : KEEP_TOP
        const { ask: judge } = triage(hits, keepTop, namedHosts(c.request))
        if (!judge.length) return { items: [], calls: [], errors: ['nothing to judge'] }
        const { state, questions } = searchRequest(c.query, c.request, hits, judge)
        const reply = await ask(ctx.host, state, questions, { timeoutMs, retries: 0 })
        const items = Object.keys(questions).map(name => {
          const a = reply.answers[name]
          return { id: name, gold: !c.hits[Number(name.slice(1))]!.helps, score: a?.type === 'noul' ? 1 - a.noul : null }
        })
        return { items, calls: [reply], errors: [] }
      }
      const plan = fetchPlan(c)
      if (!plan.ask.length) return { items: [], calls: [], errors: ['nothing to judge'] }
      const { state, questions } = fetchRequest(c.prompt, c.request, c.url, plan.chunks, plan.ask)
      const reply = await ask(ctx.host, state, questions, { timeoutMs, retries: 0 })
      const items = Object.keys(questions).map(name => {
        const a = reply.answers[name]
        return { id: name, gold: !neededChunk(c, plan.chunks[Number(name.slice(1))]!), score: a?.type === 'noul' ? 1 - a.noul : null }
      })
      return { items, calls: [reply], errors: [] }
    } catch (error) {
      if (error instanceof JevError) return { items: [], calls: [], errors: [error.code] }
      throw error
    }
  },
  truth(c, _state, question) {
    const i = Number(question.slice(1))
    if (c.kind === 'search') return c.hits[i]?.helps
    const chunk = fetchPlan(c).chunks[i]
    return chunk ? neededChunk(c, chunk) : undefined
  },
  evaluate: itemMetrics,
}
