// /jev-mod compact's task-level bench (scaffolded, not yet run): a real headless session is built
// in a copy of task-fixture/, the facts the questions ask about stated or read early, then bulk
// that pushes them back. Each arm then compacts its own fork of that session and is asked the
// questions without reading any file; the checker scores the answers.
//
//   arms: no compaction (the upper bound), Claude Code's /compact, and /jev-mod compact at each
//         drop confidence of the sweep, for each backend
//
// Unverified until a real run: that `claude -p --resume <id> --fork-session "/compact"` and
// "/jev-mod compact" compact a headless session (the mod queues /compact from a timer, which a
// -p process may exit before). A run whose compaction did nothing shows it: its context size and
// answers match the no-compaction arm's.

import { DROP_CONFIDENCE } from '../../../engine/compact'
import type { Arm, Checked, Step, TaskAdapter, TaskCase } from '../../../bench/types'

export type CompactTask = TaskCase & { questions: { q: string; answer: RegExp }[] }

const READ_ONLY = ['Read', 'Grep', 'Glob']
const BULK = [
  'Read logs/build.log in full and list every module it compiles, with the slowest step for each.',
  'Read src/cart.py and src/price.py and explain, line by line, how a cart total is computed.',
  'Suggest five unit tests for src/cart.py, each with its input and expected total in cents. Do not write any files.',
]

export const TASKS: CompactTask[] = [
  {
    id: 'rules-and-counts',
    fixture: 'src/features/compact/bench/task-fixture',
    setup: [
      'Two rules for this whole session: never edit config.json, and every price is in cents. Reply only "noted".',
      'Read logs/build.log and tell me how many warnings it has, and which option they are about.',
      ...BULK,
    ],
    allowedTools: READ_ONLY,
    questions: [
      { q: 'Which file must never be edited in this session?', answer: /config\.json/i },
      { q: 'What unit are prices in?', answer: /cents?/i },
      { q: 'How many warnings did logs/build.log have?', answer: /\b7\b|seven/i },
      { q: 'Which option were the warnings about?', answer: /legacy_tax/i },
    ],
  },
  {
    id: 'exact-values',
    fixture: 'src/features/compact/bench/task-fixture',
    setup: [
      'Remember these for later: the staging port is 8431 and the deploy user is "shipit". Reply only "noted".',
      'Read src/price.py and tell me the mug promotion, in cents.',
      ...BULK,
    ],
    allowedTools: READ_ONLY,
    questions: [
      { q: 'What is the staging port?', answer: /8431/ },
      { q: 'What is the deploy user?', answer: /shipit/i },
      { q: 'How much does the mug promotion take off, in cents?', answer: /\b100\b/ },
    ],
  },
  {
    id: 'decision-and-reason',
    fixture: 'src/features/compact/bench/task-fixture',
    setup: [
      'Decision for this project: the cache stays on SQLite, not Postgres, because we deploy to a single host. Reply only "noted".',
      'Read config.json and tell me the tax rate and the currency.',
      ...BULK,
    ],
    allowedTools: READ_ONLY,
    questions: [
      { q: 'Which database does the cache use?', answer: /sqlite/i },
      { q: 'Why was that database chosen?', answer: /single[- ]host|one host/i },
      { q: 'What is the tax rate in config.json?', answer: /0?\.15|15\s*%/ },
    ],
  },
]

/** The questions as one prompt: answer from the conversation only, one numbered line each. */
export function questionPrompt(t: CompactTask): string {
  return ['Answer from what was said and read earlier in this conversation; do not read or search any file. ' +
    'If you do not know, say "unknown". One numbered line per answer:', ...t.questions.map((q, i) => `${i + 1}. ${q.q}`)].join('\n')
}

/** Each numbered answer line checked against its pattern; the share right is the score, all right is success. */
export function checkAnswers(t: CompactTask, text: string): Checked {
  const lines = text.split('\n')
  const right = t.questions.map((q, i) => {
    const line = lines.find(l => new RegExp(`^\\s*\\**${i + 1}[.)]`).test(l))
    return line !== undefined && q.answer.test(line)
  })
  const n = right.filter(Boolean).length
  return { success: n === t.questions.length, score: t.questions.length ? n / t.questions.length : 0, detail: { right } }
}

export const task: TaskAdapter<CompactTask> = {
  feature: 'compact',
  cases: () => TASKS,
  extraArms: (): Arm[] => [{ id: 'no compaction', kind: 'claude', backend: null, settings: {} }],
  steps(t, arm): Step[] {
    const ask: Step = { prompt: questionPrompt(t), final: true }
    if (arm.id === 'no compaction') return [ask]
    return [{ prompt: arm.kind === 'claude' ? '/compact' : '/jev-mod compact' }, ask]
  },
  overlay(arm) {
    const drop = typeof arm.settings.drop === 'number' ? arm.settings.drop : DROP_CONFIDENCE
    return { features: {}, ...(arm.kind === 'jev-mod' ? { compact: { dropConfidence: drop } } : {}) }
  },
  check: (t, finalText) => checkAnswers(t, finalText),
  usdPerCall: 0.15,
  decisionCallsPerArm: 2,
}
