// The shapes the bench shares: a result row, a feature's adapter, the metrics a report reads.
// See README.md in this folder for how they fit together.

import type { Asked, Host } from '../engine/client'

export type Level = 'decision' | 'task'

/** Which backend answered, as the person named it: never its key, URL or headers. */
export type BackendRef = {
  /** `typesafe`, `openrouter`, `venice`, `zen`, a name from backends.json, `default`, `fake`, or a baseline's name. */
  name: string
  kind: 'provider' | 'named' | 'default' | 'fake' | 'baseline'
  /** The model id it was asked for, when the bench knows it (backends.json, a provider's default). */
  model: string | null
}

export type Setting = number | string | boolean

/**
 * One thing the decision model judged, reduced to what a threshold sweep needs: whether acting
 * on it is right (`gold`: drop it, refuse it, cut it), and the number the feature compares to its
 * threshold (`score`; act when score >= threshold). null: never acted on (it chose the other side).
 */
export type Item = { id: string; gold: boolean; score: number | null }

/** One case of one run: a line of a results JSONL file. */
export type Row = {
  schema: 1
  run: string
  feature: string
  level: Level
  /** jev-mod's version and the commit the bench ran from. */
  jevmod: string
  git: string
  date: string
  backend: BackendRef
  /** The model the backend said answered (from its reply). */
  answered_model: string | null
  settings: Record<string, Setting>
  /** The sweep asked for at run time, as `name=from:to:step`; the report recomputes it from the scores. */
  sweep: string | null
  case: string
  outcome: 'ok' | 'error' | 'skipped'
  /** A JevError code, or a short reason; never a server's message. */
  error?: string
  items: Item[]
  /** The adapter's own data for its metrics (ids, structure, probabilities): never case text it did not write. */
  detail?: Record<string, unknown>
  calls: number
  latencies_ms: number[]
  input_tokens: number | null
  /** What the decision calls cost, as the client bills them (0 for a named backend or a free tier). */
  cost_usd: number
  /** Set on every row a fake backend answered. */
  fake?: true
  // task level
  arm?: string
  success?: boolean
  /** The checker's score, 0..1 (the share of questions answered right, for example). */
  score?: number
  wall_ms?: number
  claude_cost_usd?: number
  claude_tokens?: { input: number; output: number; cache_read: number; cache_write: number }
  decision_calls?: number
  /** Set on a case's shared-setup row: what building the session cost, once per case, before any arm. */
  setup?: true
  /** The final step's context: its input tokens, cached or not (for compaction, what the question read). */
  context_tokens?: number | null
  /** What a compaction the mod recorded kept and dropped, in messages. */
  compaction?: Compaction
}

/** One compaction as the mod records it in the bench ledger: messages before, kept and dropped, and why nothing went. */
export type Compaction = { messages: number; kept: number; dropped: number; skip: string | null }

/** What every row of one run shares. */
export type RunMeta = Pick<Row, 'schema' | 'run' | 'feature' | 'level' | 'jevmod' | 'git' | 'date' | 'settings' | 'sweep'>

export type Confusion = { tp: number; fp: number; tn: number; fn: number }

export type Metrics = Confusion & {
  accuracy: number
  precision: number | null
  recall: number | null
  f1: number | null
  /** The feature's effect at this threshold (share dropped, share cut), 0..1. */
  effect: number
  /** Anything else worth a column (gold lines lost, keep messages lost). */
  extra: Record<string, number>
  /** Cases that could be scored. */
  cases: number
}

export type Threshold = {
  /** The name used in `--sweep name=from:to:step`. */
  name: string
  /** What the feature uses today. */
  default: number
  /** The sweep the report draws when the run asked for none. */
  from: number
  to: number
  step: number
  /** Which way is safer, for ties: `higher` thresholds act less (drop less, refuse less). */
  safer: 'higher' | 'lower'
  /** What "safer" means for this feature, in a sentence. */
  saferMeans: string
  /** Where the value is set: a knob in config.json, a backends.json tuning key, or none yet. */
  where: { knob: { feature: string; name: string } } | { tuning: string } | { none: string }
  /** How the setting relates to the swept number, when they differ (trim-output's keepThreshold does not; see its adapter). */
  note?: string
}

export type AskContext = {
  /** The client's Host for the chosen backend: the client looks up its own key. */
  host: Host
  timeoutMs: number
  settings: Record<string, Setting>
}

export type Judged = {
  items: Item[]
  detail?: Record<string, unknown>
  calls: Asked[]
  errors: string[]
}

/** A feature's decision-level bench: its cases, how one is asked, and how a threshold scores. */
export interface DecisionAdapter<C = unknown> {
  feature: string
  title: string
  threshold: Threshold
  /** The effect's name for the plots and the table ("messages dropped", "lines cut"). */
  effect: string
  /**
   * What the recommendation maximises, when not accuracy: trim-output's line accuracy rewards
   * cutting nearly everything, so it ranks by gold lines lost, then by lines cut.
   */
  objective?: { label: string; score(m: Metrics): number }
  cases(): readonly C[]
  caseId(c: C): string
  /** Ask about one case the way the feature does, through ctx.host. */
  judge(c: C, ctx: AskContext): Promise<Judged>
  /** For the fake backend: the right answer to one question of a request (yes, or an option's name). */
  truth(c: C, state: Record<string, unknown>, question: string): boolean | string | undefined
  /** Metrics for the rows of one backend at one threshold. */
  evaluate(rows: readonly Row[], threshold: number): Metrics
  /** Rows for comparisons that need no backend (trim-output's keep-failures-only filter). */
  baselines?(meta: RunMeta): Row[]
}

/** One step of a task-level run: a prompt (or a slash command) sent with `claude -p`. */
export type Step = {
  prompt: string
  /** Its output is what the checker reads. */
  final?: true
  /** Tools refused for this step (`--disallowedTools`): a question answered from the context alone. */
  disallowedTools?: string[]
  /** About what this call costs, in dollars, for the estimate (else the adapter's usdPerCall). */
  usd?: number
}

export type TaskCase = {
  id: string
  /** A folder of files copied into a scratch project for the run (relative to the repo), if any. */
  fixture?: string
  /** Prompts that build the session, run once per case and shared by every arm (forked from). */
  setup: string[]
  /** Tools the headless run may use without asking. */
  allowedTools?: string[]
  /** The scratch project is made a git repository with one commit first, as a real project is. */
  git?: boolean
  /** About what the shared setup costs, in dollars, for the estimate (else its prompts at the adapter's setup price). */
  setupUsd?: number
}

export type Arm = {
  id: string
  /** `claude`: the feature off (plain Claude Code for it); `jev-mod`: the feature on. */
  kind: 'claude' | 'jev-mod'
  backend: string | null
  settings: Record<string, Setting>
}

export type Checked = { success: boolean; score: number; detail?: Record<string, unknown> }

/** What one arm of one case did, for the adapter's verify: what the runner can see from outside. */
export type ArmRun = {
  /** Decision entries the mod wrote to the arm's ledger: one per decision request it made. */
  ledgerEntries: number
  /** The final step's input tokens, cached or not: the context its model call read. null: no usage reported. */
  contextTokens: number | null
  /** The last compaction the mod recorded in the arm's ledger, or null when it recorded none. */
  compaction: Compaction | null
}

/** A feature's task-level bench: cases run end to end with `claude -p`, per arm. */
export interface TaskAdapter<C extends TaskCase = TaskCase> {
  feature: string
  cases(): readonly C[]
  /** Arms beyond plain Claude Code and the feature on (compaction adds one with no compaction at all). */
  extraArms?(): Arm[]
  /** The prompts one arm sends after the shared setup (for compaction: the compaction, then the questions). */
  steps(c: C, arm: Arm): Step[]
  /** The bench overlay's feature sections for this arm (core/bench-overlay.ts); the runner adds the rest. */
  overlay(arm: Arm): { features: Record<string, Record<string, unknown>>; compact?: { dropConfidence: number } }
  check(c: C, finalText: string, workdir: string): Checked | Promise<Checked>
  /**
   * Did the arm do what it is meant to (compact, say)? A short error code when it plainly did
   * not, and the row is an error instead of a score; null when it did or cannot be told. `all`
   * holds every arm of the case, by id, so an arm can be compared with another.
   */
  verify?(c: C, arm: Arm, run: ArmRun, all: ReadonlyMap<string, ArmRun>): string | null
  /** About what one Claude call of this bench costs, in dollars, for the estimate (a step's own `usd` wins). */
  usdPerCall: number
  /** About what one shared-setup call costs, when it differs from usdPerCall. */
  setupUsdPerCall?: number
  /** About how many decision calls one jev-mod arm's steps make. */
  decisionCallsPerArm: number
  /** The `--max-budget-usd` each `claude -p` gets when --max-usd-per-call is not given (else 2). */
  maxUsdPerCall?: number
  /** Lines the plan prints under its estimate: how the adapter priced its steps. */
  estimateNote?(cases: readonly C[]): string[]
}
