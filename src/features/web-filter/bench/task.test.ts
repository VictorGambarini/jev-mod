import { test, expect } from 'claude-code/testing'
import { armsFor, guard, overlayFor, plan } from '../../../bench/plan'
import { verifyArms } from '../../../bench/task-rows'
import type { ArmRun, Row } from '../../../bench/types'
import { htmlOf } from '../../../bench/prose'
import { FILTER_TASKS, pageHtml } from './pages'
import { check, promptFor, task } from './task'

const GOLD: Record<string, string> = {
  'ferry-swap': 'The harbour duty officer, Ingrid Halvorsen, on the Blue Swap Sheet.',
  'library-quiet-hour': 'The Linden Room; the caretaker, Mr Osei, keeps the key.',
  'bike-coop-returns': 'Corvane Components.',
  'repair-clinic-lead': 'Beatriz Quillan, who wears an orange sash.',
  'garden-hotline': 'The Lantern Line, answered by Joaquin Reyes on public holidays.',
  'lab-two-pages': 'Dr Nakamura checks the spill kits; Tamsin Fenwick places the weekly order.',
  'ferry-lockup': 'Rashid Okafor; he hangs the key on the red hook.',
  'studio-kiln': 'Odile Marchetti runs it; passes are recorded in the blue folder.',
  'lab-booking': 'It is called Lumen.',
}

test('nine cases, each with a gold answer that scores 1 and a wrong one that does not', () => {
  expect(FILTER_TASKS.map(t => t.id).sort()).toEqual(Object.keys(GOLD).sort())
  for (const t of FILTER_TASKS) {
    expect(check(t, GOLD[t.id]!)).toMatchObject({ success: true, score: 1 })
    expect(check(t, 'I could not find that on the page.').success).toBe(false)
  }
  // an answer with only half of two facts is half right
  const swap = FILTER_TASKS.find(t => t.id === 'ferry-swap')!
  expect(check(swap, 'Ingrid Halvorsen').score).toBe(0.5)
})

test('every page is long, deterministic, free of digits and figures the filter would keep, and holds its needles', () => {
  for (const t of FILTER_TASKS) {
    for (const spec of Object.values(t.pages)) {
      const html = pageHtml(spec)
      expect(html).toBe(htmlOf(spec))
      expect(html.length).toBeGreaterThan(14_000)
      expect(html.replace(/<[^>]*>/g, '')).not.toMatch(/\d/)
      for (const n of spec.needles) expect(html).toContain(n.text)
    }
    // the answer is on the pages the task fetches, and only in its needles
    const all = Object.values(t.pages).map(pageHtml).join('\n')
    for (const p of t.answer) expect(all).toMatch(p)
  }
})

test('the prompt names every page it needs, how to ask WebFetch, the question and a short answer', () => {
  for (const t of FILTER_TASKS) {
    const prompt = promptFor(t, 'https://127.0.0.1:1')
    for (const path of Object.keys(t.pages)) expect(prompt).toContain(`https://127.0.0.1:1${path}`)
    expect(prompt).toContain('with WebFetch')
    expect(prompt).toContain(t.question)
    expect(prompt).not.toMatch(/web filter|jev/i)
  }
})

test('the plan: plain Claude Code and the filter on, one step per arm, no shared setup, and it needs --yes', () => {
  const cases = task.cases()
  expect(cases).toHaveLength(9)
  for (const c of cases) expect(c.setup).toEqual([])
  const arms = armsFor(task, ['openrouter'], null, {})
  expect(arms.map(a => a.id)).toEqual(['claude', 'jev-mod openrouter'])
  const p = plan(task, cases, arms)
  expect(p.claudeCalls).toBe(18)
  expect(p.setupCalls).toBe(0)
  expect(p.decisionCalls).toBe(9 * task.decisionCallsPerArm)
  expect(guard(p, false)).toContain('Rerun with --yes')
  expect(guard(p, true)).toBeNull()
})

test('the overlay: the filter on in the jev-mod arm (at the swept bar), every other feature off in both', () => {
  const [plain, mod, swept] = armsFor(task, ['openrouter'], null, {}).concat(armsFor(task, ['openrouter'], { name: 'minConfidence', values: [0.7] }, {}).slice(1))
  const off = overlayFor(task, plain!, '/l').features as Record<string, { mode: string }>
  expect(off['web-filter']).toEqual({ mode: 'off' })
  const on = overlayFor(task, mod!, '/l').features as Record<string, Record<string, unknown>>
  expect(on['web-filter']).toEqual({ mode: 'on' })
  expect(on['trim-output']).toEqual({ mode: 'off' })
  const tuned = overlayFor(task, swept!, '/l').features as Record<string, Record<string, unknown>>
  expect(tuned['web-filter']).toEqual({ mode: 'on', minConfidence: 0.7 })
})

test('an arm whose filter was never asked is no_long_fetch, never a score; plain Claude Code is left alone', () => {
  const [c] = task.cases()
  const arms = armsFor(task, ['openrouter'], null, {})
  const spend = { requests: 1, calls: 1, cost_usd: 0.0001 }
  const row = (arm: string): Row => ({ outcome: 'ok', success: true, score: 1, case: c!.id, arm } as unknown as Row)
  const done: { arm: (typeof arms)[number]; row: Row; run: ArmRun }[] = [
    { arm: arms[0]!, row: row('claude'), run: { ledgerEntries: 0, contextTokens: 9, compaction: null, byFeature: {} } },
    { arm: arms[1]!, row: row('jev'), run: { ledgerEntries: 1, contextTokens: 9, compaction: null, byFeature: { screening: spend } } },
  ]
  verifyArms(task, c!, done)
  expect(done[0]!.row.outcome).toBe('ok')
  expect(done[1]!.row).toMatchObject({ outcome: 'error', error: 'no_long_fetch' })
  expect(done[1]!.row.score).toBeUndefined()
  const asked = [{ ...done[1]!, row: row('jev'), run: { ...done[1]!.run, byFeature: { screening: spend, 'web-filter': spend } } }]
  verifyArms(task, c!, asked)
  expect(asked[0]!.row.outcome).toBe('ok')
})
