import { test, expect } from 'claude-code/testing'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import type { Row } from '../../../bench/types'
import { ALWAYS_KEEP_LAST, unitsOf } from '../keep'
import { adapter, keptAt } from './adapter'
import { SESSIONS } from './cases'
import { answersOf, checkAnswers, questionPrompt, TASKS, verify } from './task'

const meta = { schema: 1 as const, run: 'r', feature: 'compact', level: 'decision' as const, jevmod: '0.10.0', git: 'abc', date: 'd', settings: {}, sweep: null }

async function fakeRows(): Promise<Row[]> {
  return runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'fake-jev' }, hostFor: fakeHostFor(adapter), meta, timeoutMs: 8000, settings: {} })
}

test('the sessions are long enough to compact, labelled throughout, with both labels outside the kept tail', () => {
  expect(SESSIONS.length).toBe(10)
  for (const s of SESSIONS) {
    expect(s.messages.length).toBeGreaterThan(ALWAYS_KEEP_LAST + 8)
    const scored = s.messages.slice(0, -ALWAYS_KEEP_LAST)
    expect(scored.some(m => m.gold === 'drop')).toBe(true)
    expect(scored.some(m => m.gold === 'keep')).toBe(true)
    expect(unitsOf(s.messages).units.length).toBeGreaterThan(4)
  }
  expect(new Set(SESSIONS.map(s => s.id)).size).toBe(SESSIONS.length)
})

test('on the fake backend every session is judged, each unit once, and nothing secret is kept in the row', async () => {
  const rows = await fakeRows()
  expect(rows.map(r => r.outcome)).toEqual(SESSIONS.map(() => 'ok'))
  for (const [i, r] of rows.entries()) {
    const units = unitsOf(SESSIONS[i]!.messages).units
    expect(r.items).toHaveLength(units.length)
    expect(r.fake).toBe(true)
    expect(r.calls).toBeGreaterThanOrEqual(1)
    // the stored skeleton holds no message text
    expect(JSON.stringify(r.detail)).not.toContain(SESSIONS[i]!.messages[0]!.text.slice(0, 20))
  }
})

test('the sweep is monotone: a higher bar never drops more, and at 1.01 nothing goes', async () => {
  const rows = await fakeRows()
  let last = Infinity
  for (const t of [0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.01]) {
    const m = adapter.evaluate(rows, t)
    expect(m.effect).toBeLessThanOrEqual(last)
    last = m.effect
  }
  expect(adapter.evaluate(rows, 1.01).effect).toBe(0)
  expect(adapter.evaluate(rows, 1.01).extra['keep lost']).toBe(0)
  // the fake leans right, so a bar of 0.5 drops some messages labelled drop
  expect(adapter.evaluate(rows, 0.5).tp).toBeGreaterThan(0)
})

test('a text goes when its drop reaches the bar; a judged keep or an unjudged text stays; a tool pair is never dropped', () => {
  // m0 text, m1 text, m2+m3 a tool pair, then the 6-message tail
  const skeleton = [
    { i: 0, role: 'user', text: 'x' }, { i: 1, role: 'assistant', text: 'x' },
    { i: 2, role: 'assistant', text: 'x', toolUses: [{ tool_use_id: 'a' }] }, { i: 3, role: 'user', text: '', toolResults: [{ tool_use_id: 'a' }] },
    ...[4, 5, 6, 7, 8, 9].map(i => ({ i, role: 'user', text: 'x' })),
  ]
  const units = [{ text: 0 }, { text: 1 }]
  const d = { skeleton, gold: [], units, scores: [0.9, -1] }
  expect([...keptAt(d as never, 0.95)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  expect([...keptAt(d as never, 0.8)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  expect([...keptAt({ ...d, scores: [null, null] } as never, 0.5)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  // a row recorded when pairs were units: the pair is passed over, not dropped and not scored
  const old = { ...d, units: [...units, { pair: 'a' }], scores: [0.9, -1, 0.99], gold: ['drop', 'keep', 'drop', 'drop', ...Array(6).fill('keep')] }
  expect([...keptAt(old as never, 0.5)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  expect(adapter.evaluate([{ outcome: 'ok', detail: old } as never], 0.5)).toMatchObject({ tp: 1, tn: 1, fp: 0, fn: 0 })
})

test('only a message with text and no tool call or result is a unit, and the fake is told its gold label', () => {
  const s = SESSIONS[0]!
  const { units } = unitsOf(s.messages)
  units.forEach((u, j) => {
    const m = s.messages[u.text]!
    expect(!!(m.toolUses?.length || m.toolResults?.length)).toBe(false)
    expect(adapter.truth(s, {}, `t${j}`)).toBe(m.gold)
  })
})

// What a model that kept everything would answer, per case, in its own words: each must score 1.
const GOLD: Record<string, string[]> = {
  'proration-fix': [
    'BIL-231.',
    'tests.test_export test_csv_escapes_commas_in_customer_names; it is BIL-212 and Ana Folau is fixing it.',
    'billing/money.py: it is vendored into the invoicing service and the invoicing team owns it.',
    'Python\'s round() in prorate(); it rounds half to even (banker\'s rounding), so 498.5 became 498.',
    'money.round_half_up(numerator, denominator).',
    'The real number of days from cycle_start to cycle_end, because annual plans and trials have odd-length cycles.',
    '`python3 -m unittest tests.test_proration -v`',
    'test_bil_231_customer_c10482, expecting 3871 cents.',
    'Release 2.14; cut-off Thursday 16 October.',
    'Mereana Tait from product.',
    'billing/proration.py, tests/test_proration.py and CHANGELOG.md.',
    'After: GST is added once on the net total, after the proration line.',
  ],
  'credit-notes': [
    'BIL-198',
    'Credit notes must be their own document type because Xero imports them separately.',
    'Hemi Walker',
    'CN-000001',
    'With tax.gst_portion() on the refunded amount, never by scaling the invoice\'s GST, which comes out a cent off (Hemi\'s IRD notes).',
    'CreditNoteError, when the amount exceeds what is still refundable: the total less earlier credit notes.',
    'A module-level itertools.count; with 4 gunicorn workers two would hand out the same number, and it restarts on deploy.',
    'billing.sequence.Sequence("credit_note")',
    'The signing code (encode, sign_payload, verify_signature): Tomasz Nowak has PR #412 under review.',
    'credit_note.issued',
    'The proration ones are BIL-231 (Rawiri) and the export one is BIL-212.',
    'docs/credit-notes.md, for Hemi by Friday 24 October.',
  ],
  'webhook-signatures': [
    'BIL-240',
    'Kiri Wairua at Kauri Analytics.',
    'verify_signature re-serialised the JSON with ensure_ascii on, so names with macrons (non-ASCII) no longer matched the signed bytes.',
    'Clock skew (raise the tolerance); dropped because clock offsets were milliseconds and only names with macrons failed.',
    '300 seconds, the change was reverted.',
    'ensure_ascii=False (UTF-8 JSON): the wire format is a contract with partners.',
    'sign_payload and verify_signature: the partner SDK is generated from them.',
    'test_tolerates_whitespace_a_proxy_adds: the contract says proxies forward the body byte for byte.',
    'No. Kiri\'s team replays them by event id, since automatic re-sends would double-post invoices.',
    'docs/incidents/BIL-240-replay.txt',
    'Wednesday 15 October at 5pm; Tomasz Nowak reviews.',
    'python3 -m unittest tests.test_webhooks -v',
  ],
}

test('task level: three long cases, each with its gold answers scoring 1', () => {
  expect(TASKS.map(t => t.id).sort()).toEqual(Object.keys(GOLD).sort())
  for (const t of TASKS) {
    expect(t.setup.length).toBeGreaterThanOrEqual(10)
    expect(t.questions.length).toBeGreaterThanOrEqual(8)
    expect(t.questions.length).toBeLessThanOrEqual(12)
    expect(t.git).toBe(true)
    expect(questionPrompt(t)).toContain(`${t.questions.length}. ${t.questions[t.questions.length - 1]!.q}`)
    const gold = GOLD[t.id]!
    expect(gold.length).toBe(t.questions.length)
    const got = checkAnswers(t, gold.map((a, i) => `${i + 1}. ${a}`).join('\n'))
    expect(got.detail).toEqual({ right: gold.map(() => true) })
    expect([got.success, got.score]).toEqual([true, 1])
  }
})

test('task level: a summary that kept the gist scores below 1: the owner, the reason, the deadline and the command are gone', () => {
  const t = TASKS.find(c => c.id === 'proration-fix')!
  const lossy = [
    'BIL-231', 'An export test, BIL-212.', 'money.py', 'round(), but tests still failed.', 'round_half_up',
    'From cycle_start to cycle_end.', 'unknown', 'test_bil_231_customer_c10482, 3871', 'Release 2.14', 'unknown',
    'proration.py, test_proration.py, CHANGELOG.md', 'After.',
  ]
  const got = checkAnswers(t, lossy.map((a, i) => `${i + 1}. ${a}`).join('\n'))
  expect(got.detail).toEqual({ right: [true, false, false, false, true, false, false, true, false, false, true, true] })
  expect(got.score).toBe(5 / 12)
  expect(got.success).toBe(false)
})

test('task level: an answer may run over several lines, bold or bulleted; a value starting a line is not an answer number', () => {
  const t = TASKS.find(c => c.id === 'proration-fix')!
  const text = [
    'Here is what I have:', '', '**1.** BIL-231', '2) test_csv_escapes_commas_in_customer_names', '   Ticket BIL-212, Ana Folau has it.',
    '- 3. `billing/money.py`', '  It is vendored into the invoicing service.', '4: unknown', '5. unknown', '6. unknown', '7. unknown',
    '8. unknown', '9. The release:', '2.14 is the release; the cut-off is Thursday the 16th.', '10. Mereana', '11. unknown', '12. unknown',
  ].join('\n')
  const answers = answersOf(text, t.questions.length)
  expect(answers[1]).toContain('BIL-212')
  expect(answers[8]).toContain('2.14 is the release')
  expect(checkAnswers(t, text).detail).toEqual({ right: [true, true, true, false, false, false, false, false, true, true, false, false] })
  // a skipped answer is only that one wrong; the number itself never answers ("1." is not a ticket)
  expect(checkAnswers(t, '1. BIL-231\n5. round_half_up').detail).toEqual({ right: t.questions.map((_, i) => i === 0 || i === 4) })
  expect(checkAnswers(t, '9. unknown').detail).toEqual({ right: t.questions.map(() => false) })
  expect(checkAnswers(t, '').score).toBe(0)
})

test('task level: a jev-mod arm that trimmed results counts as compacted; one that removed nothing meaningful does not', () => {
  const jev = { id: 'jev-mod openrouter', kind: 'jev-mod' as const, backend: 'openrouter', settings: {} }
  const run = (contextTokens: number, compaction: object | null) =>
    ({ ledgerEntries: 2, byFeature: { compact: { requests: 2, calls: 6, cost_usd: 0.001 } }, contextTokens, compaction }) as never
  const all = (r: never) => new Map([['no compaction', { contextTokens: 170_000 } as never], ['jev-mod openrouter', r]])
  const trimmedOnly = run(60_000, { messages: 144, kept: 144, dropped: 0, trimmed: 70, charsRemoved: 400_000, files: 70, skip: null })
  expect(verify(TASKS[0]!, jev, trimmedOnly, all(trimmedOnly))).toBe(null)
  // nothing dropped, nothing trimmed
  const nothing = run(60_000, { messages: 144, kept: 144, dropped: 0, trimmed: 0, charsRemoved: 0, files: 0, skip: null })
  expect(verify(TASKS[0]!, jev, nothing, all(nothing))).toBe('not_compacted')
  // a few small results trimmed: the question read nearly the whole context
  const little = run(165_000, { messages: 144, kept: 144, dropped: 0, trimmed: 2, charsRemoved: 3_000, files: 2, skip: null })
  expect(verify(TASKS[0]!, jev, little, all(little))).toBe('not_compacted')
  // a record from before trimming, with nothing dropped
  const old = run(60_000, { messages: 144, kept: 144, dropped: 0, skip: null })
  expect(verify(TASKS[0]!, jev, old, all(old))).toBe('not_compacted')
})
