// The features jev-mod has, each declared once: its modes, its default, its knobs and the help
// text the /jev-mod command and the dashboard show. The config files, the command and the
// dashboard are all read from this list, so a feature added here appears in all three.

export const MODES = ['off', 'shadow', 'on'] as const
export type Mode = (typeof MODES)[number]

export type Knob =
  | { type: 'int' | 'number'; title: string; help: string; default: number; min: number; max: number }
  | { type: 'boolean'; title: string; help: string; default: boolean }
  | { type: 'choice'; title: string; help: string; default: string; options: readonly string[] }
  /** Any of `options`, none included: kept as their names joined by commas, in the options' order. */
  | { type: 'list'; title: string; help: string; default: string; options: readonly string[] }

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
  /**
   * It acts for the person beyond this machine (the browser): the reverse of protective. A
   * project's file may only turn it off (on is the looser mode here), and its knobs are not read.
   */
  risky?: true
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
      + 'Reads, builds, tests and edits inside the project are never sent. A call that carries a secret is never sent: on, it is '
      + 'put to you with that reason (shadow counts would-ask-secret, on counts asked-secret). No answer in time, private '
      + 'mode, the daily budget or a backend cool-off: the call goes on as Claude Code decided. In '
      + 'bypassPermissions, auto and dontAsk modes the mode settles the ask (it may allow or refuse it without you).',
    modes: ['off', 'shadow', 'on'], default: 'off', protective: true,
    knobs: {
      minConfidence: { type: 'number', title: 'Confidence', default: 0.7, min: 0, max: 1,
        help: 'One bar used two ways. A hard-to-undo call runs unasked only if the decision model is at least this sure '
          + 'you asked for it, so higher asks more often there. A call is put to you for breaking a limit you stated only '
          + 'if the model is at least this sure it does, so higher asks less often there.' },
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
      + 'that final message and what the turn ran (edited files, commands and the head and tail of their output, then the session\'s earlier commands as far as they fit) and judges whether the '
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
    id: 'rules-gate',
    title: 'Rules gate',
    summary: "Refuses an edit the decision model judges breaks the project's written rules",
    help: 'Before Write, Edit, MultiEdit or NotebookEdit changes a file inside the project, the decision model reads the change '
      + 'and the rules that apply to that file (list items and short directives in CLAUDE.md, AGENTS.md and CLAUDE.local.md '
      + 'from the project root down to the file\'s folder, and .claude/rules/*.md whose paths: match it), one question per '
      + 'rule: does this change break it? on: when it is at least minConfidence (0.8) sure one is broken, the edit is refused '
      + 'and the agent is told which rule, quoting it and its file, and asked to fix the change or tell you why the rule '
      + 'should not apply. shadow: judged in the background and counted (would-block, passed, skipped); no edit waits for it '
      + 'or is refused. off: nothing is sent. Only edits inside the project are judged (outside it is the tool gate\'s). '
      + 'No answer within timeoutMs, no key, private mode, a secret in the change, the daily budget or a backend cool-off: '
      + 'the edit goes on. The thresholds are not yet tested against real answers: run it in shadow first.',
    modes: ['off', 'shadow', 'on'], default: 'off', protective: true,
    knobs: {
      minConfidence: { type: 'number', title: 'Confidence to refuse', default: 0.8, min: 0.5, max: 1,
        help: 'How sure the decision model must be that a change breaks a rule for the edit to be refused.' },
      maxRules: { type: 'int', title: 'Rules per edit', default: 25, min: 5, max: 60,
        help: 'The most rules judged per edit; past it, those whose words match the file\'s path and the change are kept, nearer files first.' },
      timeoutMs: { type: 'int', title: 'Time limit (ms)', default: 3000, min: 1000, max: 10000,
        help: 'How long an edit waits for the decision before it goes on unjudged.' },
      maxChangeChars: { type: 'int', title: 'Change sent', default: 6000, min: 1000, max: 20000,
        help: 'About how many characters of the change are sent (redacted); a Write to an existing file sends the lines that differ.' },
      subagents: { type: 'boolean', title: 'Subagents too', default: true,
        help: 'true: a subagent\'s edits are judged as the agent\'s are. false: they go on unjudged.' },
    },
  },
  {
    id: 'access-gate',
    title: 'Access gate',
    summary: 'Blocks logging in to other machines (ssh, remote desktop, cloud shells, tunnels, remote databases, key reads) unless you allow it for this session',
    help: 'Before a Bash command runs, it is read locally (no decision model: behind sudo, env, timeout, nohup, xargs, '
      + '`bash -c` and eval too) for what reaches another machine: ssh, remote-desktop, cloud-shell, fleet, tunnels, '
      + 'remote-db, legacy, scanning, and keys (reading private keys and credential stores, also through Read, Grep, Write '
      + 'and Edit, or writing ~/.ssh/authorized_keys or ~/.ssh/config). An MCP tool whose name says ssh, rdp, vnc, remote, '
      + 'shell, exec, kubectl or k8s counts too. on: a call in a category this session has not allowed is refused, and the '
      + 'model is told to ask you to run it, or to allow it with /jev-mod access <category> on (only you can: the '
      + 'command must be typed at the prompt). Allows last for the session; /jev-mod access shows them, '
      + '/jev-mod access ssh on <host> allows only that host, /jev-mod access all off closes them all. shadow: counted as '
      + 'would-block, nothing refused. A pattern gate, not a sandbox: a Python script, a compiled binary or an alias gets '
      + 'round it. docs/ACCESS.md has the categories and the limits.',
    modes: ['off', 'shadow', 'on'], default: 'off', protective: true,
    knobs: {
      alwaysAllow: { type: 'list', title: 'Allowed in every session', default: '',
        options: ['ssh', 'remote-desktop', 'cloud-shell', 'fleet', 'tunnels', 'remote-db', 'legacy', 'scanning', 'keys'],
        help: 'Categories never blocked, comma-separated (for example remote-db,scanning). Read from your own file only, never a project\'s.' },
      allowLocalhost: { type: 'boolean', title: 'This machine is fine', default: true,
        help: 'true: a command whose every host is this machine (ssh localhost, telnet 127.0.0.1) is not blocked.' },
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
    id: 'review-triage',
    title: 'Review triage',
    summary: 'A tool the model calls before a code review: quick (one pass is enough) or full, and which files first',
    help: 'on: the model is offered a review_triage tool (mcp__jev-mod__review_triage) to call before it reviews a change. '
      + 'It reads the git diff (the uncommitted changes against HEAD, or the last commit when there are none, or the changes '
      + 'since a base the model names) and asks the decision model seven yes/no questions about it: security-sensitive code, '
      + 'hard-to-undo data changes, a public interface others rely on, runtime-only failures, a rule in the project\'s '
      + 'CLAUDE.md or AGENTS.md, behaviour changed without a test, and work beyond the stated intent. quick: every answer '
      + 'is no with at least minConfidence. Anything else is full, naming the questions and the files behind them (one '
      + 'more request asks which files). It never replaces the review; it only sets how deep the first pass goes. The '
      + 'diff is sent redacted and cut to maxDiffChars; a part that looks like it holds a secret is not sent, and makes '
      + 'the verdict full; a diff over ten times maxDiffChars is not sent at all (full). No key, private mode, the daily '
      + 'budget, a backend cool-off or no answer within timeoutMs: full, with the reason. off: the tool is not offered '
      + '(a session started while it was on keeps it, and it answers that it is off). There is no shadow: the model '
      + 'calls the tool by choice, so there is nothing to watch it do unasked.',
    modes: ['off', 'on'], default: 'off',
    knobs: {
      minConfidence: { type: 'number', title: 'Confidence for quick', default: 0.8, min: 0.5, max: 1,
        help: 'How sure the decision model must be of each no for the verdict to be quick. Higher answers full more often.' },
      maxDiffChars: { type: 'int', title: 'Diff sent', default: 12000, min: 2000, max: 40000,
        help: 'About how many characters of the diff are sent; a larger diff is cut to fit, and one over ten times this is not triaged.' },
      timeoutMs: { type: 'int', title: 'Time limit (ms)', default: 8000, min: 1000, max: 30000,
        help: 'How long the tool waits for the decision model before it answers full.' },
    },
  },
  {
    id: 'browser',
    title: 'Browser',
    summary: 'A tool the model calls to drive a web page toward a goal; the decision model picks each step',
    help: 'on: the model is offered a browse tool (mcp__jev-mod__browse) for pages that need clicking or typing. A headless '
      + 'Chromium on a throwaway profile opens startUrl; each step the page\'s links, buttons and fields become a table of '
      + 'actions and the decision model picks one (it never writes text: what to type comes from the call\'s inputs, sent '
      + 'to it by name only). The page text it reads is redacted and screened first. It stays on the start site; a '
      + 'consequential step (buy, pay, send, delete, post, sign up, submit a form) is taken only when the goal names it and '
      + 'the decision model is at least confirmConfidence sure the goal asks for it, else it stops for you; "done" needs a '
      + 'second check over the page\'s own text. Needs Playwright: /jev-mod browser install (once; about 150 MB). '
      + 'A project file may turn it off, never on, and sets none of its settings. docs/BROWSER.md has the rules.',
    modes: ['off', 'on'], default: 'off', risky: true,
    knobs: {
      maxSteps: { type: 'int', title: 'Steps per call', default: 20, min: 5, max: 60,
        help: 'The most steps one browse call takes; a call may ask for fewer, never more.' },
      confirmConfidence: { type: 'number', title: 'Confidence to act', default: 0.85, min: 0.5, max: 1,
        help: 'How sure the decision model must be that the goal asks for a consequential step for it to be taken without you, '
          + 'and that the page shows the goal achieved for done.' },
      stepFloor: { type: 'number', title: 'Step floor', default: 0.4, min: 0.3, max: 0.95,
        help: 'A step the decision model is less sure of than this is not taken: the call stops as blocked with the top three. '
          + 'An ordinary step (click, type, scroll) scores 0.35-0.55 on a real site; a consequential one still needs '
          + 'confirmConfidence and a goal that names it.' },
      headed: { type: 'boolean', title: 'Show the browser', default: false,
        help: 'true: the Chromium window is shown (needs a display).' },
      allowAttach: { type: 'boolean', title: 'Allow your Chrome', default: false,
        help: 'true: a call may ask to drive your own Chrome over remote debugging (JEV_MOD_BROWSER_CDP, default '
          + 'http://127.0.0.1:9222), with your sign-ins, in a new tab it closes after. Only your own file sets it.' },
      textChars: { type: 'int', title: 'Page text sent', default: 6000, min: 1000, max: 20000,
        help: 'About how many characters of each page\'s main text the decision model reads per step.' },
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
  if (knob.type === 'list') {
    const given = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,]+/) : null
    if (!given || !given.every(v => typeof v === 'string')) return bad(`a comma-separated list of ${knob.options.join(', ')}`)
    const named = (given as string[]).map(v => v.trim().toLowerCase()).filter(v => v && v !== 'none')
    const unknown = named.filter(v => !knob.options.includes(v))
    if (unknown.length) return bad(`a comma-separated list of ${knob.options.join(', ')} (or none)`)
    return { value: knob.options.filter(o => named.includes(o)).join(',') }
  }
  if (knob.type === 'choice') {
    return typeof value === 'string' && knob.options.includes(value) ? { value } : bad(`one of ${knob.options.join(', ')}`)
  }
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  const range = `${knob.type === 'int' ? 'a whole number' : 'a number'} from ${knob.min} to ${knob.max}`
  if (!Number.isFinite(n) || n < knob.min || n > knob.max || (knob.type === 'int' && !Number.isInteger(n))) return bad(range)
  return { value: n }
}
