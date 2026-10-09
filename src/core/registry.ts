// The features jev-mod has, each declared once: its modes, its default, its knobs and the help
// text the /jev-mod command and the dashboard show. The config files, the command and the
// dashboard are all read from this list, so a feature added here appears in all three.

export const MODES = ['off', 'shadow', 'on'] as const
export type Mode = (typeof MODES)[number]

export type Knob =
  | { type: 'int' | 'number'; title: string; help: string; default: number; min: number; max: number }
  | { type: 'boolean'; title: string; help: string; default: boolean }
  | { type: 'choice'; title: string; help: string; default: string; options: readonly string[] }

export type KnobValue = number | boolean | string

export type Feature = {
  id: string
  title: string
  /** One line: what it does. */
  summary: string
  /** What each mode does, and anything else worth knowing before turning it on. */
  help: string
  /** The modes it has; "shadow" (decide and count, change nothing) only where that means something. */
  modes: readonly Mode[]
  default: Mode
  knobs: Record<string, Knob>
  /**
   * It guards the person (screening, the gates): a project's file, which comes with a cloned
   * repo, may only make its mode stricter (off < shadow < on), and its knobs are not read.
   */
  protective?: true
  /** Where earlier versions kept its switch, still read below the config files. */
  legacy?: {
    /** The /config field, and the value that meant "not set". */
    option: string
    unset: string
    /** jev-skills' state.json key, and the kill file beside it (<KEY>_OFF). */
    state?: string
  }
}

export const FEATURES: readonly Feature[] = [
  {
    id: 'routing',
    title: 'Model routing',
    summary: "Each turn's model and effort from the decision model's lane",
    help: 'on: the decision model reads each prompt and picks the smallest model and effort that should still get it right. '
      + 'off: every turn runs as Claude Code sends it. Subagents keep the model their definition names.',
    modes: ['off', 'on'], default: 'off', knobs: {},
    legacy: { option: 'routing', unset: 'default' },
  },
  {
    id: 'skills',
    title: 'Skill suggestions',
    summary: 'Suggests the installed skill that matches a prompt',
    help: 'on: a matching skill is named beside the prompt, once per skill per session. '
      + 'shadow: the match is made and counted, nothing is added.',
    modes: ['off', 'shadow', 'on'], default: 'off', knobs: {},
    legacy: { option: 'skills', unset: 'default', state: 'hook_skills' },
  },
  {
    id: 'screening',
    title: 'Screening',
    summary: 'Withholds instructions aimed at the model in fetched text',
    help: 'on: WebFetch, WebSearch, MCP results and Bash output fetched from the network are screened, and the sentences '
      + 'that carry instructions are withheld. shadow: screened and counted, nothing withheld.',
    modes: ['off', 'shadow', 'on'], default: 'on', knobs: {}, protective: true,
    legacy: { option: 'screening', unset: 'default', state: 'hook_screen' },
  },
  {
    id: 'tool-gate',
    title: 'Tool-call gate',
    summary: 'Asks you before a consequential tool call the decision model doubts',
    help: 'Before a consequential call runs (Bash that pushes, deletes, rewrites history, publishes, installs, deploys, '
      + 'migrates or writes outside the project; Write/Edit outside the project; an MCP tool that sends, creates, '
      + 'changes or deletes), the decision model is asked whether you asked for it, whether it breaks a limit you '
      + 'stated, and whether it is hard to undo. on: a doubtful call is put to you in the permission dialog, with the '
      + 'reason, instead of running unasked. shadow: decided in the background and counted (would-ask, passed, skipped); nothing changes and no call waits for it; on counts asked-person. '
      + 'It only tightens Claude Code\'s own decision: a call your rules refuse or already ask about is left alone. '
      + 'Reads, builds, tests and edits inside the project are never sent. No answer in time, private mode, a secret '
      + 'in the call, the daily budget or a backend cool-off: the call goes on as Claude Code decided. In '
      + 'bypassPermissions, auto and dontAsk modes the mode settles the ask (it may allow or refuse it without you).',
    modes: ['off', 'shadow', 'on'], default: 'off', protective: true,
    knobs: {
      minConfidence: { type: 'number', title: 'Confidence', default: 0.7, min: 0, max: 1,
        help: 'How sure the decision model must be that you asked for a hard-to-undo call for it to run unasked, '
          + 'and that a call breaks a limit you stated for it to be put to you. Higher asks more often.' },
      scope: { type: 'choice', title: 'Which calls', default: 'all-risky', options: ['bash', 'bash+edits', 'all-risky'],
        help: 'bash: consequential Bash commands only. bash+edits: also Write/Edit outside the project. all-risky: also '
          + 'MCP tools whose names send, create, change or delete.' },
      timeoutMs: { type: 'int', title: 'Time limit (ms)', default: 2000, min: 500, max: 5000,
        help: 'How long a call waits for the decision before it goes on as Claude Code decided.' },
    },
  },
  {
    id: 'stop-gate',
    title: 'Completion gate',
    summary: 'Checks that a turn claiming the work is done has the evidence to show it',
    help: 'When the main agent ends a turn saying the work is done or that checks pass, the decision model reads the request, '
      + 'that final message and what the turn ran (edited files, commands and the tail of their output) and judges whether the '
      + 'claims are shown. on: when it is sure enough they are not, the agent is told which claim is unshown and asked to verify '
      + 'it or say plainly what is unverified, never to take a destructive step; at most maxNudges times per prompt. '
      + 'shadow: the same judgement, in the background, counted as would-nudge or passed; the agent is never stopped or kept waiting. off: nothing is read or sent.',
    modes: ['off', 'shadow', 'on'], default: 'off', protective: true,
    knobs: {
      maxNudges: { type: 'int', title: 'Nudges per prompt', help: 'How many times one prompt\'s turn may be sent back to verify; 0 never sends it back.', default: 2, min: 0, max: 5 },
      minConfidence: { type: 'number', title: 'Confidence to nudge', help: 'How sure the decision model must be that a claim is unshown before the agent is sent back.', default: 0.7, min: 0, max: 1 },
      evidenceChars: { type: 'int', title: 'Evidence sent', help: 'About how many characters of commands and output are sent with each judgement: more sees more, and costs more.', default: 6000, min: 1000, max: 20000 },
    },
  },
  {
    id: 'trim-output',
    title: 'Output trimming',
    summary: 'Cuts long Bash output down to what the current goal needs; the full output is kept in a file',
    help: 'on: a Bash output of minLines lines or more is trimmed before the model reads it. Runs of repeated or near-identical '
      + 'lines are folded locally; then the decision model judges each remaining chunk against your latest request, and '
      + 'chunks it scores under keepThreshold are replaced by a marker naming their lines. Errors, warnings, failures, stack '
      + 'traces, summaries and the first and last lines are always kept. The full output is saved under '
      + '~/.cache/jev-mod/outputs/ (the last 50) and the trimmed output names the file. '
      + 'shadow: what would be cut is computed in the background and counted; nothing is changed and the command never waits for it. '
      + 'Subagents, private profiles and localOnly get the local folding only.',
    modes: ['off', 'shadow', 'on'], default: 'off',
    knobs: {
      minLines: { type: 'int', title: 'Minimum lines', help: 'Outputs shorter than this are left alone.', default: 200, min: 20, max: 100_000 },
      keepThreshold: { type: 'number', title: 'Keep threshold',
        help: "A chunk is dropped when the decision model's probability that the goal needs it is under this.", default: 0.35, min: 0, max: 1 },
      localOnly: { type: 'boolean', title: 'Local only',
        help: 'true: fold repeats only, and never send output to the decision model.', default: false },
    },
  },
  {
    id: 'find-files',
    title: 'Find files',
    summary: 'A tool the model calls to find the files that implement something described in plain words',
    help: 'on: the model is offered a find_files tool (mcp__jev-mod__find_files). Given a query such as "where retries '
      + 'with backoff are done", it lists the files under the project (git\'s list, so .gitignore is honoured), scores '
      + 'them locally by the query\'s words in each path, its first lines and how many lines mention them, and sends the '
      + 'best maxCandidates as short cards (path, header comment, the names it defines, a few matching lines, redacted) '
      + 'for the decision model to judge: implements, related or unrelated. The model gets a ranked list of paths, each '
      + 'with a reason. No key, private mode, the daily budget, a backend cool-off or no answer within timeoutMs: the '
      + 'local ranking comes back, labelled as such. A card or query that looks like it holds a secret is not sent. '
      + 'off: the tool is not offered (a session started while it was on keeps it, and it answers that it is off). '
      + 'There is no shadow: the model calls the tool by choice, so there is nothing to watch it do unasked.',
    modes: ['off', 'on'], default: 'off',
    knobs: {
      maxCandidates: { type: 'int', title: 'Files judged', default: 60, min: 10, max: 200,
        help: 'How many of the best local matches the decision model judges per query: more finds more, and costs more.' },
      limit: { type: 'int', title: 'Files returned', default: 10, min: 1, max: 50,
        help: 'How many files the tool returns when the model does not say.' },
      timeoutMs: { type: 'int', title: 'Time limit (ms)', default: 8000, min: 1000, max: 30000,
        help: 'How long the tool waits for the decision model before it answers with the local ranking.' },
    },
  },
  {
    id: 'band',
    title: 'jev-mod band',
    summary: 'A line above the prompt: what jev-mod decided, its cost, what screening withheld',
    help: 'on: the band shows once the mod has done something this session. off: nothing is drawn.',
    modes: ['off', 'on'], default: 'on', knobs: {},
    legacy: { option: 'band', unset: 'on' },
  },
]

/** How strict a mode is: off < shadow < on. */
export function strictness(mode: Mode): number {
  return MODES.indexOf(mode)
}

export function feature(id: string, features: readonly Feature[] = FEATURES): Feature | undefined {
  return features.find(f => f.id === id)
}

/** The mode a value names for this feature, or why it names none. */
export function checkMode(f: Feature, value: unknown): { mode: Mode } | { problem: string } {
  const named = typeof value === 'string' ? value.trim().toLowerCase() : value
  if (typeof named === 'string' && (f.modes as readonly string[]).includes(named)) return { mode: named as Mode }
  return { problem: `${f.id}: mode must be ${f.modes.join(', ')}, not ${JSON.stringify(value)}` }
}

/** The knob's value from what a file or a command gave, or why it is not one. Text is read as the knob's type. */
export function checkKnob(f: Feature, name: string, value: unknown): { value: KnobValue } | { problem: string } {
  const knob = f.knobs[name]
  if (!knob) return { problem: `${f.id} has no setting ${name}${Object.keys(f.knobs).length ? ` (it has ${Object.keys(f.knobs).join(', ')})` : ''}` }
  const bad = (what: string) => ({ problem: `${f.id}.${name} must be ${what}, not ${JSON.stringify(value)}` })
  if (knob.type === 'boolean') {
    if (typeof value === 'boolean') return { value }
    if (value === 'true' || value === 'on') return { value: true }
    if (value === 'false' || value === 'off') return { value: false }
    return bad('true or false')
  }
  if (knob.type === 'choice') {
    return typeof value === 'string' && knob.options.includes(value) ? { value } : bad(`one of ${knob.options.join(', ')}`)
  }
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  const range = `${knob.type === 'int' ? 'a whole number' : 'a number'} from ${knob.min} to ${knob.max}`
  if (!Number.isFinite(n) || n < knob.min || n > knob.max || (knob.type === 'int' && !Number.isInteger(n))) return bad(range)
  return { value: n }
}
