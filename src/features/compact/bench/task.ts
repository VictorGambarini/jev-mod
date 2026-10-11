// /jev-mod compact's task-level bench: a real headless session is built in a copy of
// task-fixture/, with specific details given early (exact numbers, names, a decision and its
// reason, a rule stated once, values in files read once and never discussed), then unrelated
// work that pushes them back. Each arm compacts its own fork of that session and is asked the
// questions with every tool refused, so it answers from its context alone; the checker scores
// the answers.
//
//   arms: no compaction (the upper bound), Claude Code's /compact, and /jev-mod compact at each
//         drop confidence of the sweep, for each backend
//
// A jev-mod arm sends `/compact <marker>`, the compaction /jev-mod compact runs, in one step: a
// `claude -p "/jev-mod compact"` process ends before the /compact it queues from a timer starts
// (features/compact/index.ts). An arm that did not compact is an error, `not_compacted`, never a
// score: a jev-mod arm whose ledger is empty (the decision model was never asked), or a /compact
// arm whose question ran on a context no smaller than the no-compaction arm's.

import { DROP_CONFIDENCE } from '../../../engine/compact'
import type { Arm, ArmRun, Checked, Step, TaskAdapter, TaskCase } from '../../../bench/types'
import { MARK } from '../index'

export type CompactTask = TaskCase & { questions: { q: string; answer: RegExp }[] }

const FIXTURE = 'src/features/compact/bench/task-fixture'
const READ_ONLY = ['Read', 'Grep', 'Glob']
// the question step may use nothing: what the arm kept is all it has
const NO_TOOLS = ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Agent']
const BULK = [
  'Read logs/build.log in full and list every module it compiles, with the slowest step for each.',
  'Read src/cart.py and src/price.py and explain, line by line, how a cart total is computed.',
  'Suggest five unit tests for src/cart.py, each with its input and expected total in cents. Do not write any files.',
  'Review src/cart.py for edge cases (zero or negative quantities, unknown SKUs, removing what is not there) and say how you would handle each. Do not write any files.',
]

export const TASKS: CompactTask[] = [
  {
    // details stated once, in passing, in one long message the rest of the session never mentions
    id: 'briefing',
    fixture: FIXTURE,
    setup: [
      'Some context before we start; no action needed. The client is Harbour & Pine, and our contact there is Mereana Tait. ' +
        'Go-live is 14 March. Their payment sandbox merchant id is HP-4471-Z. Refunds over $250 need a second approver, ' +
        'and that is Priya. We agreed to drop IE11 support in release 2.3. The old cron job nightly-reprice must stay ' +
        'disabled until the audit closes. Tomasz is on call this week. Reply only "noted".',
      'Read config.json and tell me the currency.',
      ...BULK,
    ],
    allowedTools: READ_ONLY,
    questions: [
      { q: 'Who is our contact at the client?', answer: /mereana/i },
      { q: 'What is the go-live date?', answer: /14\s*march|march\s*14/i },
      { q: 'What is the payment sandbox merchant id?', answer: /HP-4471-Z/i },
      { q: 'Above what amount does a refund need a second approver?', answer: /\$?\s*250\b/ },
      { q: 'Who is the second approver for refunds?', answer: /priya/i },
      { q: 'In which release is IE11 support dropped?', answer: /\b2\.3\b/ },
      { q: 'Which cron job must stay disabled?', answer: /nightly-reprice/i },
      { q: 'Who is on call this week?', answer: /tomasz/i },
    ],
  },
  {
    // values in files read once for another question, never discussed: a summary keeps the gist
    id: 'file-values',
    fixture: FIXTURE,
    setup: [
      'Read ops/services.yaml and tell me which service has the most replicas. One line.',
      'Read docs/incident-0917.md and give me its root cause in one sentence.',
      ...BULK,
    ],
    allowedTools: READ_ONLY,
    questions: [
      { q: 'In ops/services.yaml, which port does the ledger service use?', answer: /\b8157\b/ },
      { q: 'In ops/services.yaml, what is the search service\'s timeout_ms?', answer: /\b1800\b|1\.8\s*s/ },
      { q: 'In ops/services.yaml, which team owns the notify service?', answer: /growth/i },
      { q: 'In ops/services.yaml, how many replicas does the payments service have?', answer: /\b5\b|five/i },
      { q: 'In incident 0917, who was the incident commander?', answer: /aroha/i },
      { q: 'In incident 0917, how many checkouts failed?', answer: /\b312\b/ },
      { q: 'In incident 0917, what timeout did the bad config push set on payments?', answer: /\b600\s*ms|\b600\b/ },
      { q: 'In incident 0917, who owns the action item to alert on the payments 502 rate?', answer: /sione/i },
    ],
  },
  {
    // a decision made, then changed with a reason; rules stated once; counts read from a log
    id: 'decisions-and-rules',
    fixture: FIXTURE,
    setup: [
      'Plan for the session cache: we will use Redis. Reply only "noted".',
      'Read logs/build.log and tell me how many warnings it has, which option they are about, and the module of the first one.',
      BULK[0]!,
      'Change of plan: the session cache stays on SQLite, not Redis, because we deploy to a single host and ops will not run ' +
        'another service. Two rules for the rest of this session: never edit config.json, and every price is in cents. Reply only "noted".',
      ...BULK.slice(1),
    ],
    allowedTools: READ_ONLY,
    questions: [
      { q: 'Which store does the session cache use now? One word.', answer: /^\W*sqlite/i },
      { q: 'Why was that store chosen?', answer: /single[- ]host|one host/i },
      { q: 'Which file must never be edited in this session?', answer: /config\.json/i },
      { q: 'What unit are prices in?', answer: /cents?/i },
      { q: 'How many warnings did logs/build.log have?', answer: /\b7\b|seven/i },
      { q: 'Which option were the warnings about?', answer: /legacy_tax/i },
      { q: 'In which module was the first warning?', answer: /\bm8\b/i },
      { q: 'How much does the mug promotion take off, in cents?', answer: /\b100\b/ },
    ],
  },
]

/** The questions as one prompt: answer from the conversation only, one numbered line each. */
export function questionPrompt(t: CompactTask): string {
  return ['Answer from what was said and read earlier in this conversation; do not read or search any file. ' +
    'If you do not know, say "unknown". One numbered line per answer:', ...t.questions.map((q, i) => `${i + 1}. ${q.q}`)].join('\n')
}

/** Each numbered answer line, its number taken off, checked against its pattern; the share right is the score, all right is success. */
export function checkAnswers(t: CompactTask, text: string): Checked {
  const lines = text.split('\n')
  const right = t.questions.map((q, i) => {
    const head = new RegExp(`^\\s*\\**${i + 1}[.)]\\**\\s*`)
    const line = lines.find(l => head.test(l))
    // the answer without its number, so a pattern never matches the number itself
    return line !== undefined && q.answer.test(line.replace(head, ''))
  })
  const n = right.filter(Boolean).length
  return { success: n === t.questions.length, score: t.questions.length ? n / t.questions.length : 0, detail: { right } }
}

// a /compact arm whose question read at least this share of the no-compaction arm's context did not compact
const NOT_SMALLER = 0.9

/** Did this arm compact? A reason code when it plainly did not, else null. */
export function verify(_t: CompactTask, arm: Arm, run: ArmRun, all: ReadonlyMap<string, ArmRun>): string | null {
  if (arm.id === 'no compaction') return null
  if (arm.kind === 'jev-mod') return run.ledgerEntries === 0 ? 'not_compacted' : null
  const base = all.get('no compaction')?.contextTokens
  if (!base || !run.contextTokens) return null
  return run.contextTokens >= NOT_SMALLER * base ? 'not_compacted' : null
}

export const task: TaskAdapter<CompactTask> = {
  feature: 'compact',
  cases: () => TASKS,
  extraArms: (): Arm[] => [{ id: 'no compaction', kind: 'claude', backend: null, settings: {} }],
  steps(t, arm): Step[] {
    // the question reads the whole forked context once (the real run: about $0.4-0.5)
    const ask: Step = { prompt: questionPrompt(t), final: true, disallowedTools: NO_TOOLS, usd: 0.5 }
    if (arm.id === 'no compaction') return [ask]
    // /compact runs the summariser (about $0.6-0.8); the mod's compaction runs no Claude model
    return [arm.kind === 'claude' ? { prompt: '/compact', usd: 0.7 } : { prompt: `/compact ${MARK}`, usd: 0.02 }, ask]
  },
  overlay(arm) {
    const drop = typeof arm.settings.drop === 'number' ? arm.settings.drop : DROP_CONFIDENCE
    return { features: {}, ...(arm.kind === 'jev-mod' ? { compact: { dropConfidence: drop } } : {}) }
  },
  check: (t, finalText) => checkAnswers(t, finalText),
  verify,
  usdPerCall: 0.5,
  // a setup call resumes a growing session and may read files
  setupUsdPerCall: 0.4,
  decisionCallsPerArm: 2,
}
