// /jev-mod compact's task-level bench: a long, real headless coding session is built in a copy of
// task-fixture/ (ledgerline, a small billing codebase with a CLAUDE.md, tests that run with
// python3, a CI log, an app log and a month of invoices), the way a person works: a bug or a
// feature, files read, tests run and failing, an approach tried and abandoned, corrections ("don't
// touch X"), a constraint stated once, a decision with its reason, a ticket, an owner and a
// deadline mentioned in passing, edits, tests again, and side work (whole logs and the CSV read)
// that is most of the bulk. A case's setup builds about 100k tokens of conversation over Claude
// Code's own ~28k, so a summary has to leave things out.
//
// Each arm compacts its own fork of that session and is asked what a continuation needs, with
// every tool refused, so it answers from its context alone; the checker scores the answers. That
// measures what survives in context: a trimmed tool result names a file Claude could Read, but
// here it may not, so a fact that lived only in a trimmed middle counts as lost.
//
//   arms: no compaction (the upper bound), Claude Code's /compact, and /jev-mod compact at its
//         shipped default for each backend (a --sweep of drop adds one arm per value; the drop
//         bar is also the bar under which a trim keeps 600 characters of that end)
//
// A jev-mod arm sends `/compact <marker>`, the compaction /jev-mod compact runs, in one step: a
// `claude -p "/jev-mod compact"` process ends before the /compact it queues from a timer starts
// (features/compact/index.ts). The mod writes what it kept, dropped and trimmed to the arm's
// ledger, and saves the results it trimmed under the ledger folder. An arm that did not compact is
// an error, `not_compacted`, never a score: a compacting arm whose question ran on a context not
// meaningfully smaller than the no-compaction arm's, or a jev-mod arm that recorded no
// compaction, or one that neither dropped a message nor trimmed a result.

import { DROP_CONFIDENCE } from '../../../engine/compact'
import type { Arm, ArmRun, Checked, Step, TaskAdapter, TaskCase } from '../../../bench/types'
import { MARK } from '../index'

/** One question: every pattern must match its answer. */
export type Question = { q: string; answer: RegExp | RegExp[] }
export type CompactTask = TaskCase & {
  questions: Question[]
  /** About how many tokens of conversation the setup builds (tool output included), for the estimate. */
  conversation: number
}

const FIXTURE = 'src/features/compact/bench/task-fixture'
// what a person lets a coding session do in the scratch copy without asking
const SESSION_TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'MultiEdit', 'Write', 'Bash(python3:*)', 'Bash(scripts/check.sh:*)',
  'Bash(./scripts/check.sh:*)', 'Bash(sh scripts/check.sh:*)', 'Bash(bash scripts/check.sh:*)', 'Bash(ls:*)', 'Bash(wc:*)',
  'Bash(grep:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(cat:*)', 'Bash(mkdir:*)', 'Bash(git diff:*)', 'Bash(git status:*)']
// the question step may use nothing: what the arm kept is all it has
const NO_TOOLS = ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'TodoWrite']

const DATE = /16\s*(th\s*)?oct|oct\w*\.?\s*16|thu(rsday)?\b|16\/10|10-16/i

export const TASKS: CompactTask[] = [
  {
    // a bug fix: an approach tried and reverted, a file not to touch, a decision with its reason
    id: 'proration-fix',
    fixture: FIXTURE,
    git: true,
    conversation: 105_000,
    setup: [
      'Morning. I\'m picking up BIL-231 today. Before we touch it, get your bearings: read README.md, list billing/ and tests/, ' +
        'and read billing/plans.py, billing/money.py and billing/invoice.py. Give me a short overview of how a plan becomes an invoice.',
      'BIL-231 is from support: customers who changed plan mid-cycle in August were charged slightly wrong, a cent here and there, ' +
        'and some by more than a dollar. Read billing/proration.py and tests/test_proration.py, then run scripts/check.sh so we see where main is.',
      'Right. test_csv_escapes_commas_in_customer_names has been failing on main for a week; that\'s BIL-212 and Ana Folau on finance ' +
        'tooling is fixing it, so leave billing/export.py and its test alone. Also, check.sh is slow on CI because of the export fixtures, ' +
        'so while we iterate on this just run `python3 -m unittest tests.test_proration -v`. Before changing anything, read ' +
        'docs/architecture.md and docs/adr/0003-integer-cents.md.',
      'The ticket mentions customer C-10482. The August invoices are in data/invoices_2026-08.csv. Read the whole file, not just a grep ' +
        'for that one customer: I want to know whether other customers who changed plan in August look wrong too, and roughly how many.',
      'Let\'s start with the rounding. Try the simplest thing first: use Python\'s round() in prorate() instead of int(), then run the ' +
        'proration tests and tell me what passes and what doesn\'t.',
      'Right, round() rounds half to even, so 498.5 goes to 498 and test_rounds_half_up_on_odd_amounts can\'t pass with it. Revert the ' +
        'round() change. Don\'t touch billing/money.py either: it\'s vendored into the invoicing service and the invoicing team owns it. ' +
        'It already has round_half_up(numerator, denominator); use that in prorate(), all in integer arithmetic. Run the proration tests again.',
      'Now the cycle length. upgrade_charge uses CYCLE_DAYS = 30 for every cycle. We agreed in Tuesday\'s billing sync that the cycle ' +
        'length is always the real number of days from cycle_start to cycle_end, because annual plans and trials have cycles of odd ' +
        'lengths too, so a fixed month can\'t be right. Fix that in upgrade_charge (remove CYCLE_DAYS if nothing else uses it) and run the proration tests.',
      'While that\'s fresh, a side question: the nightly on the 8th failed. Go through the whole of logs/ci-nightly-2026-10-08.log, not ' +
        'only the failures, and tell me whether anything other than BIL-231 and BIL-212 is wrong in there: warnings, slow tests, anything.',
      'Add a regression test called test_bil_231_customer_c10482 to tests/test_proration.py with that customer\'s real numbers from the ' +
        'CSV: Starter to Growth on 2026-08-17, cycle 2026-08-01 to 2026-09-01. Work out the right charge by hand in a comment in the ' +
        'test, and run the proration tests.',
      'Quick question, don\'t change anything: read billing/tax.py again with invoice.py in mind. Is GST worked out before or after ' +
        'the proration line goes on the invoice? Finance asked.',
      'This has to go out in release 2.14; the cut-off is Thursday 16 October, and Mereana Tait from product wants a line about it in ' +
        'CHANGELOG.md under Unreleased. Read the CHANGELOG to match its style, add the entry, then run scripts/check.sh once for the ' +
        'whole suite and tell me what still fails.',
      'Last thing before lunch: read logs/staging-app.log end to end and tell me whether the proration.line entries in it look wrong ' +
        'given what we just fixed. Don\'t fix anything else.',
    ],
    allowedTools: SESSION_TOOLS,
    questions: [
      { q: 'Which ticket is this work for?', answer: /BIL-231/i },
      { q: 'Which test was already failing on main for another reason, what is its ticket, and who is fixing it?',
        answer: [/csv_escapes|export/i, /BIL-212/i, /\bAna\b/i] },
      { q: 'Which file did I say must not be edited for the rounding fix, and why?', answer: [/money\.py/i, /vendor|invoicing|owns|shared/i] },
      { q: 'What was tried first for the rounding, and why was it abandoned?', answer: [/\bround\b/i, /half[- ]to[- ]even|banker|\beven\b/i] },
      { q: 'Which helper does prorate() use for rounding now?', answer: /round_half_up/ },
      { q: 'How is the cycle length worked out now, and why?', answer: [/real|actual|cycle_start|days (from|between)|days_between/i, /annual|trial|odd/i] },
      { q: 'What command do we run the tests with while iterating?', answer: /python3? -m unittest tests\.test_proration/ },
      { q: 'What is the name of the regression test you added, and what charge does it expect, in cents?',
        answer: [/test_bil_231_customer_c10482/i, /\b3,?871\b|38\.71/] },
      { q: 'Which release must this ship in, and what is the cut-off date?', answer: [/\b2\.14\b/, DATE] },
      { q: 'Who asked for the CHANGELOG entry?', answer: /mereana/i },
      { q: 'Which files have you changed in this session?', answer: [/proration\.py/i, /test_proration/i, /changelog/i] },
      { q: 'Is GST worked out before or after the proration line goes on the invoice?', answer: /\bafter\b/i },
    ],
  },
  {
    // a feature: a design corrected by the person, rules from finance, a first counter replaced, code under review
    id: 'credit-notes',
    fixture: FIXTURE,
    git: true,
    conversation: 105_000,
    setup: [
      'Hi. New feature today, BIL-198. First get your bearings: read README.md, billing/invoice.py, billing/tax.py, billing/sequence.py ' +
        'and tests/test_invoice.py, and tell me in a few lines how an invoice gets built and numbered.',
      'BIL-198: we need credit notes for partial refunds. Today support refunds cards by hand and finance raises credit notes in Xero ' +
        'manually; read docs/architecture.md for the background. A credit note references the original invoice, carries the refunded ' +
        'amount and the GST inside it, and has its own number. How would you do it? Don\'t write code yet.',
      'No, not a negative Invoice: Hemi Walker in finance says credit notes have to be their own document type, because Xero imports ' +
        'them separately from invoices. So a CreditNote dataclass in a new module, billing/credit_notes.py. Numbers are CN- and six ' +
        'digits with their own counter, so the first one is CN-000001. Before you write it, read data/invoices_2026-08.csv in full and ' +
        'tell me how many August invoices had partial refunds noted, so we know the volume.',
      'Go ahead: write billing/credit_notes.py with issue_credit_note(invoice, amount_cents, reason) and tests in ' +
        'tests/test_credit_notes.py. For the counter, start simple: a module-level itertools.count is fine for a first pass. Run ' +
        '`python3 -m unittest tests.test_credit_notes -v`.',
      'Two rules from Hemi\'s IRD notes. The refunded amount is GST inclusive. And the GST on a credit note is computed from the ' +
        'refunded amount with tax.gst_portion(), never by scaling the original invoice\'s GST, because scaling gives results a cent off. ' +
        'Check your code against both, fix it if needed, add a test, and run the credit note tests.',
      'Also: a credit note can never be more than what is still refundable on the invoice, which is its total less any earlier credit ' +
        'notes against it, and only a paid invoice can have one. Raise a CreditNoteError otherwise. Test both and run the tests.',
      'Thinking about it, the itertools.count counter won\'t do: the api runs 4 gunicorn workers, so two workers would hand out the ' +
        'same CN number, and it starts again on every deploy. Switch to billing.sequence.Sequence like the invoices, with the name ' +
        '"credit_note", and add a test that two Sequence objects sharing one store never repeat a number. Run the tests.',
      'Different thing while I remember: the nightly on the 8th failed. Read all of logs/ci-nightly-2026-10-08.log and tell me which ' +
        'tests are the slowest and whether any of the failures could be ours.',
      'Now the webhook: issuing a credit note should emit a credit_note.issued event. Read billing/webhooks.py, ' +
        'docs/webhooks-contract.md and tests/test_webhooks.py first. Add a credit_note_issued() builder next to invoice_paid(), with a ' +
        'test, and add the event to the table in docs/webhooks-contract.md. Don\'t touch the signing code (encode, sign_payload, ' +
        'verify_signature): Tomasz Nowak has a change to it under review in PR #412.',
      'Run scripts/check.sh and tell me what fails.',
      'The proration failures are BIL-231, which Rawiri is doing on another branch, and the export one is BIL-212; leave both. Now ' +
        'write docs/credit-notes.md for finance: short, what a credit note is in ledgerline, how its number works, how its GST is ' +
        'worked out. Hemi needs it by Friday 24 October.',
      'Last thing: read logs/staging-app.log end to end and tell me whether anything in it touches refunds or would change once ' +
        'credit notes exist. Don\'t change anything.',
    ],
    allowedTools: SESSION_TOOLS,
    questions: [
      { q: 'Which ticket is this feature for?', answer: /BIL-198/i },
      { q: 'Why is a credit note not a negative Invoice?', answer: [/own|separate|distinct|different/i, /xero/i] },
      { q: 'Who in finance set the rules for credit notes?', answer: /hemi/i },
      { q: 'What is the number of the first credit note?', answer: /CN-000001/ },
      { q: 'How must the GST on a credit note be computed, and why?', answer: [/gst_portion/, /scal|cent|IRD/i] },
      { q: 'What error is raised when a credit note is too large, and what is the limit?',
        answer: [/CreditNoteError/, /refundable|earlier credit|less|minus|remaining/i] },
      { q: 'What did the first version use as the credit note counter, and why was it replaced?',
        answer: [/itertools|count\(|module[- ]level|global|in[- ]memory/i, /worker|gunicorn|process|deploy|restart/i] },
      { q: 'What hands out credit note numbers now?', answer: /Sequence/ },
      { q: 'Which code must you not change, and why?', answer: [/sign|encode/i, /#?412|tomasz|review/i] },
      { q: 'What is the new webhook event called?', answer: /credit_note\.issued/ },
      { q: 'Which failing tests are not ours, and what are their tickets?', answer: [/BIL-231/i, /BIL-212/i] },
      { q: 'Which doc are you writing for finance, and by when?', answer: [/credit-notes\.md/i, /24\s*(th\s*)?oct|oct\w*\.?\s*24|fri(day)?\b|24\/10|10-24/i] },
    ],
  },
  {
    // an investigation: the logs read for real, a hypothesis tried and dropped, a contract not to break, an incident decision
    id: 'webhook-signatures',
    fixture: FIXTURE,
    git: true,
    conversation: 105_000,
    setup: [
      'Hi. Partners have been reporting failed webhook deliveries since Monday, ticket BIL-240; Kiri Wairua at Kauri Analytics raised ' +
        'it. Start by reading logs/staging-app.log end to end and tell me what pattern you see in the failures.',
      'Read billing/webhooks.py, tests/test_webhooks.py and docs/webhooks-contract.md, then run the webhook tests with ' +
        '`python3 -m unittest tests.test_webhooks -v`.',
      'My first guess is clock skew between us and the partners: the tolerance is only 300 seconds. Try raising TOLERANCE_SECONDS to ' +
        '900 and add a test that a delivery ten minutes old is accepted, then run the webhook tests.',
      'Hmm, no. The log shows clock offsets of a few milliseconds, and the failures are all for customers with macrons in their names ' +
        '(Tāne Mahuta, Mātai Health and so on), so it isn\'t the clock. Revert the tolerance change and your new test. Instead write a ' +
        'failing test first: sign a payload whose customer_name has a macron and check verify_signature accepts it. Run it and show me it fails.',
      'Fix it by verifying the exact bytes received: verify_signature must not re-serialise the JSON. Keep ensure_ascii=False in ' +
        'encode(): partners asked for UTF-8 JSON and the wire format is a contract (docs/webhooks-contract.md), so we are not changing ' +
        'it. And don\'t rename sign_payload or verify_signature or change their arguments; the partner SDK is generated from them. Run ' +
        'the webhook tests.',
      'test_tolerates_whitespace_a_proxy_adds fails now, as expected. The contract says proxies must forward the body byte for byte, ' +
        'so that test asserts something we never promised: delete it, and run the webhook tests again.',
      'Read docs/architecture.md, then check every module in billing/ for anything else that re-serialises JSON before signing or ' +
        'after receiving.',
      'How many customers could be affected? Read data/invoices_2026-08.csv in full and count the customers whose names have ' +
        'non-ASCII characters; list them.',
      'Decision for the incident: we will not re-send the failed deliveries automatically. Kiri\'s team will replay them from their ' +
        'side by event id, because automatic re-sends would double-post invoices into their ledger. Write the id of every delivery that ' +
        'gave up, from the staging log, one per line with its partner and customer, into docs/incidents/BIL-240-replay.txt.',
      'Run scripts/check.sh.',
      'The proration failures are BIL-231 and the export one is BIL-212, both someone else\'s. Now read logs/ci-nightly-2026-10-08.log ' +
        'in full: did the webhook tests ever fail in CI, or did this only show up in staging?',
      'OK. This has to be deployed by Wednesday 15 October at 5pm, and Tomasz Nowak is reviewing. Add a CHANGELOG.md entry under ' +
        'Unreleased in the file\'s style.',
    ],
    allowedTools: SESSION_TOOLS,
    questions: [
      { q: 'Which ticket is this?', answer: /BIL-240/i },
      { q: 'Who reported it, and from which partner?', answer: [/kiri/i, /kauri/i] },
      { q: 'What was the root cause?', answer: [/macron|non-?ascii|unicode|utf|ensure_ascii|escap/i, /re-?seriali[sz]|json\.(dumps|loads)|bytes|canonical|normali[sz]/i] },
      { q: 'What was the first hypothesis, and why was it dropped?', answer: [/clock|skew|tolerance/i, /macron|non-?ascii|milli|offset|names/i] },
      { q: 'What is TOLERANCE_SECONDS now?', answer: /\b300\b/ },
      { q: 'What must stay as it is in encode(), and why?', answer: [/ensure_ascii|utf-?8/i, /contract|partner/i] },
      { q: 'Which functions must keep their names and arguments, and why?', answer: [/sign_payload/, /verify_signature/, /sdk|partner/i] },
      { q: 'Which existing test was deleted, and why?', answer: [/whitespace|proxy/i, /byte|contract|promise/i] },
      { q: 'Will the failed deliveries be re-sent automatically? Why or why not?', answer: [/\bno\b|\bnot\b|won.t|replay/i, /double|twice|duplicat/i] },
      { q: 'Where is the list of event ids to replay?', answer: /BIL-240-replay\.txt/ },
      { q: 'When must this be deployed, and who is reviewing?', answer: [/15\s*(th\s*)?oct|oct\w*\.?\s*15|wed(nesday)?\b|15\/10|10-15/i, /tomasz/i] },
      { q: 'What command runs the webhook tests?', answer: /python3? -m unittest tests\.test_webhooks/ },
    ],
  },
]

/** The questions as one prompt: answer from the conversation only, one numbered line each. */
export function questionPrompt(t: CompactTask): string {
  return ['Answer from what was said, read and done earlier in this conversation; do not read, search or run anything. ' +
    'If you do not know, say "unknown". One numbered line per answer:', ...t.questions.map((q, i) => `${i + 1}. ${q.q}`)].join('\n')
}

/**
 * Each answer: the text after its number up to the next answer's number, whether on one line or
 * several. Numbers only go up (an answer may be skipped), and a number must be followed by a
 * space, so a value that starts a line ("2.14 is the release") is never read as an answer's number.
 */
export function answersOf(text: string, count: number): (string | undefined)[] {
  const out: (string | undefined)[] = new Array(count).fill(undefined)
  const head = /^\s*(?:[-*]\s+)?\**\s*(\d{1,2})\s*[.):]\**(?=\s|$)\**\s*/
  let at = -1
  for (const line of text.split('\n')) {
    const m = head.exec(line)
    const n = m ? Number(m[1]) - 1 : -1
    if (m && n > at && n < count) {
      at = n
      out[at] = line.slice(m[0].length)
    } else if (at >= 0 && line.trim()) out[at] += `\n${line}`
  }
  return out
}

/** Each answer checked against every pattern of its question; the share right is the score, all right is success. */
export function checkAnswers(t: CompactTask, text: string): Checked {
  const answers = answersOf(text, t.questions.length)
  const right = t.questions.map((q, i) => {
    const a = answers[i]
    return a !== undefined && (Array.isArray(q.answer) ? q.answer : [q.answer]).every(p => p.test(a))
  })
  const n = right.filter(Boolean).length
  return { success: n === t.questions.length, score: t.questions.length ? n / t.questions.length : 0, detail: { right } }
}

// a compacting arm whose question read at least this share of the no-compaction arm's context did not compact
const NOT_SMALLER = 0.9

/** Did this arm compact? A reason code when it plainly did not, else null. */
export function verify(_t: CompactTask, arm: Arm, run: ArmRun, all: ReadonlyMap<string, ArmRun>): string | null {
  if (arm.id === 'no compaction') return null
  // the mod's own record: none written (it never ran), or nothing dropped and nothing trimmed
  const c = run.compaction
  if (arm.kind === 'jev-mod' && (c ? c.dropped === 0 && !c.trimmed : !(run.byFeature.compact?.requests ?? 0))) return 'not_compacted'
  const base = all.get('no compaction')?.contextTokens
  if (!base || !run.contextTokens) return null
  return run.contextTokens >= NOT_SMALLER * base ? 'not_compacted' : null
}

// Claude's prices per token at the tier the bench's `claude -p` ran on (Opus): a cache read, a
// cache write, an output token. The 2026-10-11 pilot's rows fit them within about 20%.
export const PRICE = { read: 1.5e-6, write: 18.75e-6, out: 75e-6 }
// Claude Code's own system prompt and tools, before any conversation (about 28k in the pilot)
export const SYSTEM_TOKENS = 28_000
// the API calls one setup prompt makes (its tool turns and the answer), and each one's output
const TURNS_PER_PROMPT = 6
const OUT_PER_TURN = 300
// what a /compact summary holds, and what share of the conversation a jev-mod arm is assumed to
// keep (most of it is tool output, which trimming cuts down)
const SUMMARY_TOKENS = 6000
const KEPT_SHARE = 0.5

/** A case's setup: every turn reads the session so far from the cache, and the conversation is written to it once. */
export function setupUsd(t: CompactTask): number {
  const turns = t.setup.length * TURNS_PER_PROMPT
  return turns * (SYSTEM_TOKENS + t.conversation / 2) * PRICE.read + (SYSTEM_TOKENS + t.conversation) * PRICE.write + turns * OUT_PER_TURN * PRICE.out
}

/** A fork's first call reads its whole context uncached (the pilot's forks did). */
const asked = (context: number, out = 500) => context * PRICE.write + out * PRICE.out

export const task: TaskAdapter<CompactTask> = {
  feature: 'compact',
  cases: () => TASKS.map(t => ({ ...t, setupUsd: setupUsd(t) })),
  extraArms: (): Arm[] => [{ id: 'no compaction', kind: 'claude', backend: null, settings: {} }],
  steps(t, arm): Step[] {
    const full = SYSTEM_TOKENS + t.conversation
    const ask = (context: number): Step => ({ prompt: questionPrompt(t), final: true, disallowedTools: NO_TOOLS, usd: asked(context) })
    if (arm.id === 'no compaction') return [ask(full)]
    // /compact: the summariser reads the whole context and writes a summary; the question reads the summary
    if (arm.kind === 'claude') return [{ prompt: '/compact', usd: asked(full, SUMMARY_TOKENS) }, ask(SYSTEM_TOKENS + SUMMARY_TOKENS)]
    // the mod's compaction runs no summariser, but the pilot billed its step about one full read of the context
    return [{ prompt: `/compact ${MARK}`, usd: asked(full, 0) }, ask(SYSTEM_TOKENS + KEPT_SHARE * t.conversation)]
  },
  overlay(arm) {
    const drop = typeof arm.settings.drop === 'number' ? arm.settings.drop : DROP_CONFIDENCE
    return { features: {}, ...(arm.kind === 'jev-mod' ? { compact: { dropConfidence: drop } } : {}) }
  },
  check: (t, finalText) => checkAnswers(t, finalText),
  verify,
  usdPerCall: 1,
  // one long setup prompt with several tool turns, or a question on the full context, costs a few dollars
  maxUsdPerCall: 8,
  // a session of about 150 messages: its texts in batches of 40, and its long tool results, 20 to a request
  decisionCallsPerArm: 8,
  estimateNote: cases => {
    const c = cases[0] as CompactTask | undefined
    if (!c) return []
    const full = SYSTEM_TOKENS + c.conversation
    const m = (n: number) => `$${(n * 1e6).toFixed(2)}/M`
    return [
      `  priced from about ${Math.round(c.conversation / 1000)}k tokens of conversation per case over Claude Code's ~${SYSTEM_TOKENS / 1000}k, ` +
        `at ${m(PRICE.read)} cache read, ${m(PRICE.write)} cache write, ${m(PRICE.out)} output:`,
      `    setup about $${setupUsd(c).toFixed(2)} a case (${c.setup.length} prompts, about ${c.setup.length * TURNS_PER_PROMPT} model calls on a growing context)`,
      `    a question on the full context about $${asked(full).toFixed(2)}; /compact about $${asked(full, SUMMARY_TOKENS).toFixed(2)}, ` +
        `then its question about $${asked(SYSTEM_TOKENS + SUMMARY_TOKENS).toFixed(2)}`,
      `    the mod's compaction about $${asked(full, 0).toFixed(2)} (one full read, as the pilot billed it), then its question about ` +
        `$${asked(SYSTEM_TOKENS + KEPT_SHARE * c.conversation).toFixed(2)} if it keeps half`,
    ]
  },
}
