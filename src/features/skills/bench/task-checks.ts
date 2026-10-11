// The skills feature's task-level bench: a real headless Claude Code session is given a request
// in a copy of task-fixture/ (harborview, a small order and refund service) whose
// .claude/skills/ holds 21 skills: eight that carry a convention, a script or a format the
// request needs, and thirteen that overlap them or are decoys (a release-notes skill beside the
// changelog one, a runbook skill beside the incident one, code review, profiling, ...). Two
// requests need no skill at all.
//
// Both arms have the same skills installed. Plain Claude Code sees them listed and picks (or not)
// on its own; the jev-mod arm has the skills feature on, which adds a suggestion beside the
// prompt. A deterministic checker reads the files the session produced (or its answer) and
// counts what is right; where a skill holds the convention, the output fails the check without it.
//
//   arms: plain Claude Code, and jev-mod with the skills feature on, for each backend
//
// This file is pure (no files, no processes: a test imports it); task.ts gives it the real ones.
//
// Each arm works in its own copy of the project (`isolate`). Which skill was loaded is read from
// the session's transcript (the Skill tool calls) when it can be found, and is recorded with the
// row; it is not part of the score.

import type { Arm, Checked, Step, TaskAdapter, TaskCase } from '../../../bench/types'

export type Check = [name: string, ok: boolean]
export type SkillTask = TaskCase & {
  prompt: string
  /** The skill that holds what the request needs, or null when no skill fits. */
  skill: string | null
  /** The checker: what is right about the project (and the answer) after the session. */
  checks(w: Work, answer: string): Promise<Check[]>
}

/** The project after a session, read-only. */
export type Work = {
  dir: string
  read(path: string): Promise<string>
  list(path: string): Promise<string[]>
  /** Run a program in the project; the exit code. */
  exec(cmd: string, args: string[]): Promise<{ code: number | null; out: string }>
  /** A file of the fixture as shipped, and a folder's entries in it. */
  original(path: string): Promise<string>
  originalList(path: string): Promise<string[]>
}

export const FIXTURE = 'src/features/skills/bench/task-fixture'
// what a person lets a coding session do in the scratch copy without asking
const SESSION_TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'MultiEdit', 'Write', 'Skill', 'Bash(python3:*)', 'Bash(ls:*)', 'Bash(cat:*)',
  'Bash(grep:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)', 'Bash(mkdir:*)', 'Bash(sed:*)', 'Bash(find:*)', 'Bash(sort:*)',
  'Bash(git diff:*)', 'Bash(git status:*)']

const has = (text: string, re: RegExp) => re.test(text)
/** The part of a markdown file under a heading, up to the next heading of the same or a higher level. */
export function section(text: string, heading: RegExp): string {
  const lines = text.split('\n')
  const at = lines.findIndex(l => heading.test(l))
  if (at < 0) return ''
  const level = lines[at]!.match(/^#+/)![0].length
  const out: string[] = []
  for (const l of lines.slice(at + 1)) {
    const m = l.match(/^(#+)\s/)
    if (m && m[1]!.length <= level) break
    out.push(l)
  }
  return out.join('\n')
}
/** Headings appear in this order, each once at least. */
function inOrder(text: string, headings: RegExp[]): boolean {
  let from = 0
  for (const h of headings) {
    const m = h.exec(text.slice(from))
    if (!m) return false
    from += m.index + m[0].length
  }
  return true
}
const newFiles = async (w: Work, dir: string) => { const before = await w.originalList(dir); return (await w.list(dir)).filter(f => !before.includes(f)) }

/** The requests that failed in one New Zealand business day, as logs/ and the log-analysis skill define them. */
export function failedRequests(logs: string[], day: string, prefix: string): number {
  const lo = Date.parse(`${day}T00:00:00Z`) - 13 * 3600_000
  const last = new Map<string, [number, number]>()
  for (const text of logs) {
    for (const line of text.split('\n')) {
      const m = line.match(/^(\S+Z) .*rid=(\w+) .*path=(\S+) status=(\d+) attempt=(\d+)/)
      if (!m) continue
      const t = Date.parse(m[1]!)
      const path = m[3]!
      if (t < lo || t >= lo + 86_400_000 || path === '/healthz' || !path.startsWith(prefix)) continue
      const attempt = Number(m[5])
      const seen = last.get(m[2]!)
      if (!seen || attempt >= seen[0]) last.set(m[2]!, [attempt, Number(m[4])])
    }
  }
  return [...last.values()].filter(([, status]) => status >= 500).length
}

const ADR_HEADINGS = [/^## Context\s*$/m, /^## Decision\s*$/m, /^## Consequences\s*$/m, /^## Alternatives considered\s*$/m]
const INCIDENT_HEADINGS = [/^## Summary\s*$/m, /^## Impact\s*$/m, /^## Timeline \(UTC\)\s*$/m, /^## Root cause\s*$/m, /^## Detection\s*$/m, /^## Action items\s*$/m]

export const TASKS: SkillTask[] = [
  {
    id: 'changelog-default',
    skill: 'changelog-entry',
    prompt: 'PR #482 just merged. It raises the default webhook retry limit from 3 to 5. Can you add it to the changelog?',
    async checks(w) {
      const text = await w.read('CHANGELOG.md')
      const unreleased = section(text, /^## \[Unreleased\]/)
      const ops = section(unreleased, /^### Operator notes/)
      const line = ops.split('\n').find(l => /#482/.test(l)) ?? ''
      const released = text.slice(text.indexOf('## [1.8.0]'))
      return [
        ['entry is in Operator notes', line !== ''],
        ['entry has the line format', has(line, /^\* \*\*[a-z]+\*\* — [^.]+[^.\s] \(#482\)$/)],
        ['entry gives the old and new values', has(line, /\b3\b/) && has(line, /\b5\b/)],
        ['entry is listed once', (text.match(/#482/g) ?? []).length === 1],
        ['released sections untouched', released === (await w.original('CHANGELOG.md')).slice((await w.original('CHANGELOG.md')).indexOf('## [1.8.0]'))],
      ]
    },
    setup: [],
  },
  {
    id: 'adr-queue',
    skill: 'adr-new',
    prompt: 'We decided in the platform meeting to move the job queue from the Redis lists to SQS. Can you write the ADR for it?',
    async checks(w) {
      const files = await newFiles(w, 'docs/adr')
      const file = files.find(f => /^0010-.+\.md$/.test(f)) ?? ''
      const text = file ? await w.read(`docs/adr/${file}`) : ''
      const index = await w.read('docs/adr/README.md')
      return [
        ['file is numbered 0010', file !== ''],
        ['no other new ADR file', files.filter(f => f.endsWith('.md')).length === 1],
        ['title line', has(text, /^# ADR-0010: \S.*$/m)],
        ['status is Proposed', has(text, /^- Status: Proposed\s*$/m)],
        ['deciders line', has(text, /^- Deciders: \S.*$/m)],
        ['sections in order', inOrder(text, ADR_HEADINGS)],
        ['index row added', has(index, /^\| 0010 \| .*SQS.* \| Proposed \|\s*$/mi)],
      ]
    },
    setup: [],
  },
  {
    id: 'incident-payments',
    skill: 'incident-report',
    prompt: 'Can you write up Wednesday\'s payments outage as an incident report? My notes are in notes/outage-2026-10-08.txt.',
    async checks(w) {
      const files = await w.list('docs/incidents')
      const file = files.find(f => /^2026-10-08-.+\.md$/.test(f)) ?? ''
      const text = file ? await w.read(`docs/incidents/${file}`) : ''
      const timeline = section(text, /^## Timeline/)
      const before = text.slice(0, text.search(/^## Action items/m) < 0 ? undefined : text.search(/^## Action items/m))
      return [
        ['file is docs/incidents/2026-10-08-<slug>.md', file !== ''],
        ['severity is SEV2', has(text, /^\*\*Severity:\*\* SEV2\s*$/m)],
        ['sections in order', inOrder(text, INCIDENT_HEADINGS)],
        ['timeline in UTC', ['01:51Z', '01:58Z', '02:05Z', '02:20Z', '02:34Z', '02:38Z'].every(t => timeline.includes(`- ${t} — `))],
        ['no local times in the timeline', !has(timeline, /\b(14|15):\d\d\b|[ap]m\b/i)],
        ['action items table', has(text, /\|\s*Action\s*\|\s*Owner\s*\|\s*Due\s*\|/)],
        ['due dates as ISO', ['2026-10-17', '2026-10-24', '2026-10-31'].every(d => text.includes(d))],
        ['blameless prose', !has(before, /\b(Hana|Aroha|Tom)\b/)],
      ]
    },
    setup: [],
  },
  {
    id: 'migration-archived',
    skill: 'db-migration',
    prompt: 'Add a nullable archived_at timestamp column to the orders table.',
    async checks(w) {
      const files = await newFiles(w, 'migrations')
      const up = files.find(f => /^0042_.+\.sql$/.test(f) && !f.endsWith('.down.sql')) ?? ''
      const down = files.find(f => /^0042_.+\.down\.sql$/.test(f)) ?? ''
      const upText = up ? await w.read(`migrations/${up}`) : ''
      const downText = down ? await w.read(`migrations/${down}`) : ''
      return [
        ['up file is 0042_<verb>_<object>.sql', has(up, /^0042_[a-z]+_[a-z_]+\.sql$/)],
        ['down file pairs with it', down === up.replace(/\.sql$/, '.down.sql')],
        ['risk header is medium or high', has(upText, /^-- risk: (medium|high)\s*$/m)],
        ['adds a nullable column with no default', has(upText, /ADD COLUMN archived_at\b[^;,]*\bNULL\b/i) && !has(upText, /\bDEFAULT\b/i)],
        ['does not lock writes', has(upText, /ALGORITHM\s*=\s*INPLACE/i) && has(upText, /LOCK\s*=\s*NONE/i)],
        ['down drops the column', has(downText, /DROP COLUMN archived_at/i)],
      ]
    },
    setup: [],
  },
  {
    id: 'flag-bulk-refund',
    skill: 'feature-flag',
    prompt: 'Add a feature flag for the new bulk refund flow. The payments team owns it.',
    async checks(w) {
      const toml = await w.read('config/flags.toml')
      const name = toml.match(/^\[flags\.(\w*bulk\w*refund\w*|\w*refund\w*bulk\w*)\]/m)?.[1] ?? ''
      const mine = name ? toml.slice(toml.indexOf(`[flags.${name}]`)) : ''
      const sunset = mine.match(/sunset = "(\d{4}-\d\d-\d\d)"/)?.[1]
      const days = sunset ? (Date.parse(sunset) - Date.now()) / 86_400_000 : NaN
      const check = await w.exec('python3', ['scripts/check_flags.py'])
      return [
        ['a bulk refund flag exists', name !== ''],
        ['owned by payments', has(mine, /owner = "payments"/)],
        ['off by default', has(mine, /default = false/)],
        ['sunset about 90 days out', days > 80 && days < 100],
        ['check_flags passes', check.code === 0],
        ['existing flags untouched', toml.startsWith((await w.original('config/flags.toml')).trimEnd())],
      ]
    },
    setup: [],
  },
  {
    id: 'error-refund-exceeds',
    skill: 'error-code',
    prompt: 'We need a proper error for when someone tries to refund more than the original charge. Can you add it?',
    async checks(w) {
      const src = await w.read('app/errors.py')
      const doc = await w.read('docs/error-codes.md')
      const check = await w.exec('python3', ['scripts/check_error_codes.py'])
      const cls = src.match(/class (\w+)\(HarborError\):\s+code = "HV-PAY-0107"\s+http_status = (4\d\d)/)
      return [
        ['class with code HV-PAY-0107 and a 4xx status', cls !== null],
        ['row in docs/error-codes.md', cls !== null && has(doc, new RegExp(`^\\| HV-PAY-0107 \\| ${cls[1]} \\| \\S.*\\|\\s*$`, 'm'))],
        ['row follows HV-PAY-0104', doc.indexOf('HV-PAY-0107') > doc.indexOf('HV-PAY-0104') && doc.indexOf('HV-PAY-0107') < doc.indexOf('HV-INV-0201')],
        ['check_error_codes passes', check.code === 0],
      ]
    },
    setup: [],
  },
  {
    id: 'i18n-unread',
    skill: 'i18n-string',
    prompt: 'On the billing dashboard we need a banner that says "You have 1 unread invoice" or "You have N unread invoices". Can you add the text?',
    async checks(w) {
      const trees: Record<string, any> = {}
      for (const l of ['en', 'es', 'fr']) { try { trees[l] = JSON.parse(await w.read(`locales/${l}.json`)) } catch { trees[l] = {} } }
      const dash = (l: string): Record<string, string> => trees[l]?.billing?.dashboard ?? {}
      const one = Object.keys(dash('en')).find(k => /unread/.test(k) && k.endsWith('_one')) ?? ''
      const other = one.replace(/_one$/, '_other')
      const lint = await w.exec('python3', ['scripts/i18n_lint.py'])
      const sorted = (o: object): boolean => { const k = Object.keys(o); return k.join() === [...k].sort().join() && Object.values(o).every(v => typeof v !== 'object' || sorted(v as object)) }
      return [
        ['en has _one and _other with {count}', one !== '' && /unread/.test(dash('en')[one] ?? '') && (dash('en')[other] ?? '').includes('{count}')],
        ['es and fr have both keys', ['es', 'fr'].every(l => one !== '' && one in dash(l) && other in dash(l))],
        ['untranslated text is marked', ['es', 'fr'].every(l => (dash(l)[one] ?? '').startsWith('[[TODO]] ') && (dash(l)[other] ?? '').startsWith('[[TODO]] '))],
        ['keys sorted in every file', Object.values(trees).every(t => sorted(t))],
        ['lint passes', lint.code === 0],
      ]
    },
    setup: [],
  },
  {
    id: 'logs-failed-orders',
    skill: 'log-analysis',
    prompt: 'How many order requests failed on 8 Oct?',
    async checks(w, answer) {
      const logs = await Promise.all((await w.list('logs')).sort().map(f => w.read(`logs/${f}`)))
      const want = failedRequests(logs, '2026-10-08', '/v1/orders')
      return [['the answer is the failed request count', new RegExp(`(^|[^\\d.,])${want}([^\\d]|$)`).test(answer.replace(/(\d),(\d{3})/g, '$1$2'))]]
    },
    setup: [],
  },
  {
    id: 'bug-paginate',
    skill: null,
    prompt: 'tests/test_utils.py has a failing test: paginate seems to return one item too many. Can you find the bug and fix it?',
    async checks(w) {
      const tests = await w.exec('python3', ['-m', 'unittest'])
      return [
        ['all tests pass', tests.code === 0],
        ['the tests were not edited', (await w.read('tests/test_utils.py')) === await w.original('tests/test_utils.py')],
        ['paginate returns one page', !has(await w.read('app/utils.py'), /per_page \+ 1/)],
      ]
    },
    setup: [],
  },
  {
    id: 'rename-parse-money',
    skill: null,
    prompt: 'Rename parse_amount to parse_money everywhere in the project, tests included.',
    async checks(w) {
      const texts: string[] = []
      for (const dir of ['app', 'tests']) for (const f of (await w.list(dir)).filter(f => f.endsWith('.py'))) texts.push(await w.read(`${dir}/${f}`))
      // tests/test_utils.py fails on main (the paginate bug of the other case), so only the modules this touches are run
      const tests = await w.exec('python3', ['-m', 'unittest', 'tests.test_money', 'tests.test_orders'])
      return [
        ['no parse_amount left', texts.every(t => !t.includes('parse_amount'))],
        ['parse_money is defined', has(await w.read('app/money.py'), /def parse_money\(/)],
        ['tests still pass', tests.code === 0],
        ['tests still test it', has(await w.read('tests/test_money.py'), /parse_money\("\$12\.50"\)/)],
      ]
    },
    setup: [],
  },
]

/** Every check of a case after a session: the share right is the score, all right is success. */
export async function checkTask(t: SkillTask, answer: string, w: Work): Promise<Checked> {
  const results = await t.checks(w, answer)
  const right = results.filter(([, ok]) => ok).length
  return { success: right === results.length, score: results.length ? right / results.length : 0,
    detail: { failed: results.filter(([, ok]) => !ok).map(([name]) => name), expected_skill: t.skill } }
}

/** The names of the skills a session loaded, from its transcript (one JSON object per line). */
export function skillsLoaded(transcript: string): string[] {
  const out: string[] = []
  for (const line of transcript.split('\n')) {
    if (!line.includes('"Skill"')) continue
    let e: any
    try { e = JSON.parse(line) } catch { continue }
    const content = e?.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block?.type === 'tool_use' && block.name === 'Skill' && typeof block.input?.skill === 'string') out.push(block.input.skill)
    }
  }
  return out
}

/** Claude Code's transcript folder for a project: its path with every character but letters and digits as a hyphen. */
export const transcriptDir = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, '-')

// Claude's cost per run: its system prompt and tools are read from the cache, then a few tool turns.
const USD_PER_RUN = 0.3

/** What the adapter needs from the machine: the project as files, and the transcript's skill calls. */
export type Host = {
  work(dir: string): Work
  /** The skills the session loaded in this project folder, or null when its transcript cannot be found. */
  loaded(dir: string): Promise<string[] | null>
}

export function makeTask(host: Host): TaskAdapter<SkillTask> {
  return {
    feature: 'skills',
    cases: () => TASKS.map(t => ({ ...t, fixture: FIXTURE, git: true, isolate: true as const, allowedTools: SESSION_TOOLS })),
    steps: (t): Step[] => [{ prompt: t.prompt, final: true }],
    overlay: (arm): { features: Record<string, Record<string, unknown>> } => ({ features: arm.kind === 'jev-mod' ? { skills: { mode: 'on' } } : {} }),
    async check(c, finalText, workdir) {
      const t = c as SkillTask
      const checked = await checkTask(t, finalText, host.work(workdir))
      const loaded = await host.loaded(workdir).catch(() => null)
      return { ...checked, detail: { ...checked.detail, skills_loaded: loaded,
        skill_ok: loaded === null ? null : t.skill ? loaded.includes(t.skill) : loaded.length === 0 } }
    },
    // a jev-mod arm that never asked the decision model did not run the feature
    verify: (_t, arm, run) => arm.kind === 'jev-mod' && run.ledgerEntries === 0 ? 'skills_not_run' : null,
    usdPerCall: USD_PER_RUN,
    maxUsdPerCall: 2,
    // one pick: rank the catalog, then verify the finalists
    decisionCallsPerArm: 2,
    estimateNote: cases => [`  priced at about $${USD_PER_RUN.toFixed(2)} a run (one prompt, a few tool turns on the cached system prompt); ${cases.length} requests, each in its own folder`],
  }
}
