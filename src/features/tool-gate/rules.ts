import { noul, type Answer, type Question } from '../../engine/client'
import { isSensitive, redact } from '../../engine/privacy'

// The tool-call gate's rules: which calls are consequential enough to put to the decision
// model, what it is shown, and what its answers mean. Plain functions, no IO.
//
// The classifier is deliberately narrow: it names the calls that change something beyond the
// working tree's ordinary edits (push, delete, publish, deploy, migrate, send) and lets the
// rest (reads, builds, tests, edits inside the project) through unasked, so the gate costs a
// request only where a wrong call is expensive.

export const SCOPES = ['bash', 'bash+edits', 'all-risky'] as const
export type Scope = (typeof SCOPES)[number]

export type Risk = { kind: 'bash' | 'edit' | 'mcp'; why: string }

// ── Bash ─────────────────────────────────────────────────────────────────────

// A command's start: the line's start, or after ; & | ( ` $( and a newline, then any of
// sudo, env, VAR=value, xargs, time, nohup in front of the command itself.
const START = String.raw`(?:^|[;&|(\x60\n]|\$\()\s*(?:(?:sudo|doas|env|nohup|time|xargs|command|exec)(?:\s+-\S+)*\s+|[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*`
const at = (body: string) => new RegExp(START + body, 'i')
// git and its global options (`-C dir`, `-c key=value`, `--no-pager`) before the subcommand.
const GIT = String.raw`git\s+(?:-[Cc]\s+\S+\s+|-\S+\s+)*`

/** The patterns that make a command consequential, each with the reason the person reads. */
const BASH_RISKS: [RegExp, string][] = [
  [at(String.raw`${GIT}push\b`), 'pushes to a git remote'],
  [at(String.raw`${GIT}reset\s+(?:\S+\s+)*--hard\b`), 'discards work with git reset --hard'],
  [at(String.raw`${GIT}(?:rebase|filter-branch|filter-repo)\b`), 'rewrites git history'],
  [at(String.raw`${GIT}commit\s+(?:\S+\s+)*--amend\b`), 'rewrites the last commit'],
  [at(String.raw`${GIT}(?:checkout|restore)\s+(?:\S+\s+)*(?:--\s|\.(?:\s|$)|--\S*worktree)`), 'discards uncommitted changes'],
  [at(String.raw`${GIT}clean\s+(?:\S+\s+)*-\S*f`), 'deletes untracked files'],
  [at(String.raw`${GIT}(?:branch\s+(?:\S+\s+)*-(?:D|d\b|-delete)|tag\s+(?:\S+\s+)*-d\b|stash\s+(?:drop|clear)\b|worktree\s+remove\b)`), 'deletes git refs or stashes'],
  [at(String.raw`(?:rm|rmdir|shred|unlink|srm|trash)\b`), 'deletes files'],
  [at(String.raw`find\b[^;&|\n]*\s-(?:delete|exec\s+rm)\b`), 'deletes files'],
  [at(String.raw`(?:mv|dd|truncate|mkfs(?:\.\w+)?|fdisk|parted)\b`), 'moves or overwrites files or disks'],
  [at(String.raw`(?:chmod|chown|chgrp|chattr|setfacl)\b`), 'changes permissions or ownership'],
  [at(String.raw`(?:npm|pnpm|yarn|bun)\s+(?:\S+\s+)*(?:publish|unpublish|deprecate)\b`), 'publishes a package'],
  [at(String.raw`(?:cargo|gem|poetry|flit|hatch)\s+(?:publish|push|yank)\b|twine\s+upload\b|docker\s+(?:push|image\s+push)\b`), 'publishes a package or image'],
  [at(String.raw`(?:npm|pnpm|yarn|bun)\s+(?:i|install|add|remove|uninstall|rm|update|upgrade)\b`), 'installs or removes packages'],
  [at(String.raw`(?:pip3?|pipx|uv\s+pip|gem|cargo|go|brew|apt|apt-get|dnf|yum|pacman|snap|conda|mamba)\s+(?:\S+\s+)*(?:install|uninstall|remove|purge|upgrade)\b`), 'installs or removes packages'],
  [/(?:curl|wget|fetch|iwr|irm)\b[^\n;]*\|\s*(?:sudo\s+)?(?:ba|z|da|k|fi)?sh\b|(?:ba|z)?sh\s+<\(\s*(?:curl|wget)/i, 'runs a script fetched from the network'],
  [at(String.raw`(?:curl|xh|http|https)\b[^\n;|]*(?:\s-X\s*(?:POST|PUT|PATCH|DELETE)\b|\s--request\s+(?:POST|PUT|PATCH|DELETE)\b|\s(?:-d|--data\S*|-F|--form|-T|--upload-file)\b|\s(?:POST|PUT|PATCH|DELETE)\s)`), 'sends data to a server'],
  [at(String.raw`(?:kill|pkill|killall|systemctl|service|launchctl|shutdown|reboot|halt|crontab)\b`), 'stops processes or changes services'],
  [at(String.raw`(?:psql|mysql|mariadb|sqlite3|mongo|mongosh|redis-cli|cqlsh)\b[^\n]*\b(?:drop|delete|truncate|update|insert|alter|flushall|flushdb|dropDatabase)\b`), 'changes a database'],
  [/\b(?:drop\s+(?:table|database|schema)|truncate\s+table|delete\s+from)\b/i, 'changes a database'],
  [at(String.raw`(?:(?:python3?|uv\s+run|poetry\s+run|pipenv\s+run|bundle\s+exec|pnpm\s+(?:exec|dlx)|yarn|bunx)\s+)?(?:\S*manage\.py\s+(?:migrate|flush|sqlflush)|alembic\s+(?:upgrade|downgrade)|prisma\s+(?:migrate|db\s+push)|rails\s+db:|rake\s+db:|knex\s+migrate|sequelize\s+db:|flyway\s+\w|liquibase\s+update|dbmate\s+(?:up|down|migrate|drop)|npx\s+(?:prisma\s+(?:migrate|db\s+push)|knex\s+migrate|sequelize\s+db:))`), 'runs a database migration'],
  [at(String.raw`(?:kubectl\s+(?:apply|delete|create|replace|patch|scale|rollout|drain|cordon)|helm\s+(?:install|upgrade|uninstall|rollback|delete)|terraform\s+(?:apply|destroy|import)|tofu\s+(?:apply|destroy)|pulumi\s+(?:up|destroy)|ansible-playbook|vercel\b|netlify\s+deploy|fly\s+deploy|flyctl\s+deploy|firebase\s+deploy|heroku\b|serverless\s+deploy|sls\s+deploy|cdk\s+(?:deploy|destroy)|wrangler\s+(?:deploy|publish)|gcloud\s+\S+(?:\s+\S+)*\s+(?:deploy|delete)|aws\s+\S+\s+(?:delete|rm|terminate|put|create|update|deploy)\S*|az\s+\S+(?:\s+\S+)*\s+(?:delete|create|deploy))`), 'deploys or changes cloud resources'],
  [at(String.raw`gh\s+(?:pr\s+(?:create|merge|close|comment|review|edit)|issue\s+(?:create|close|comment|edit|delete)|release\s+(?:create|delete|upload)|repo\s+(?:create|delete|archive|rename|edit)|secret\s+set|workflow\s+run|api\s+[^\n]*(?:-X\s*(?:POST|PUT|PATCH|DELETE)|--method\s+(?:POST|PUT|PATCH|DELETE)|\s-f\s|\s-F\s))`), 'acts on GitHub where others see it'],
  [at(String.raw`(?:scp|rsync|sftp)\b`), 'copies files to or from another machine'],
]

// Where a write is harmless: the project, the temp folders, devices.
const SAFE_PREFIXES = ['/tmp/', '/private/tmp/', '/var/tmp/', '/var/folders/', '/dev/']

/** A path with . and .. resolved, ~ read as `home`; relative paths are taken as the project's. */
export function resolvePath(path: string, root: string | undefined, home: string | undefined): string | null {
  let p = path.trim().replace(/^['"]|['"]$/g, '')
  if (!p) return null
  if (p === '~' || p.startsWith('~/')) {
    if (!home) return null
    p = home + p.slice(1)
  } else if (p.startsWith('$HOME/') || p.startsWith('${HOME}/')) {
    if (!home) return null
    p = home + p.slice(p.indexOf('/'))
  }
  if (!p.startsWith('/')) {
    if (!root) return null
    p = `${root}/${p}`
  }
  const parts: string[] = []
  for (const part of p.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return '/' + parts.join('/')
}

/** Whether a write to this path lands outside the project (and outside the temp folders and Claude's own notes). */
export function outsideProject(path: string, root: string | undefined, home: string | undefined): boolean {
  const full = resolvePath(path, root, home)
  if (full === null) return false
  const inside = (dir: string) => full === dir || full.startsWith(dir.endsWith('/') ? dir : dir + '/')
  if (root && inside(resolvePath(root, root, home) ?? root)) return false
  if (SAFE_PREFIXES.some(prefix => full.startsWith(prefix)) || full === '/dev/null') return false
  // Claude Code's own memory and plans are written outside the project on its own account.
  if (home && (inside(`${home}/.claude/projects`) || inside(`${home}/.claude/plans`) || inside(`${home}/.claude/todos`))) return false
  return true
}

// `> file`, `>> file`, `tee [-a] file`: where a command writes.
const REDIRECT = /(?:^|[^0-9&<>])>{1,2}\s*([^\s;&|<>()]+)/g
const TEE = /\btee\s+(?:-\S+\s+)*([^\s;&|<>()]+)/g

/** The reason a Bash command is consequential, or null for one that is not. */
export function bashRisk(command: string, root?: string, home?: string): string | null {
  if (!command.trim()) return null
  for (const [pattern, why] of BASH_RISKS) if (pattern.test(command)) return why
  for (const re of [REDIRECT, TEE]) {
    for (const m of command.matchAll(re)) {
      const target = m[1]
      if (target.startsWith('&') || target.startsWith('$(')) continue
      if (outsideProject(target, root, home)) return 'writes outside the project'
    }
  }
  return null
}

// ── MCP ──────────────────────────────────────────────────────────────────────

const MUTATING = new Set([
  'create', 'update', 'delete', 'del', 'remove', 'rm', 'send', 'post', 'publish', 'write', 'edit', 'modify', 'set',
  'add', 'insert', 'upsert', 'put', 'patch', 'move', 'rename', 'merge', 'close', 'archive', 'trash', 'transfer',
  'pay', 'deploy', 'execute', 'exec', 'submit', 'reply', 'forward', 'comment', 'share', 'invite', 'assign', 'apply',
  'label', 'unlabel', 'mark', 'upload', 'cancel', 'approve', 'reject', 'revoke', 'grant', 'push', 'drop', 'purge',
  'destroy', 'kill', 'restart', 'schedule', 'book', 'order', 'purchase', 'refund', 'resolve', 'transition', 'unpublish',
  'untrash', 'spam', 'block', 'unblock', 'subscribe', 'unsubscribe', 'enable', 'disable', 'install', 'uninstall',
])

/** The words of an MCP tool's own name: `mcp__server__send_message` -> send, message. */
export function mcpWords(tool: string): string[] {
  const name = tool.split('__').slice(2).join('_') || tool
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

export function mcpRisk(tool: string): string | null {
  if (!tool.startsWith('mcp__')) return null
  const verb = mcpWords(tool).find(w => MUTATING.has(w))
  return verb ? `a ${tool.split('__')[1] ?? 'connector'} tool that would ${verb}` : null
}

// ── every call ───────────────────────────────────────────────────────────────

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

/** Whether a call is put to the decision model, and why; null passes it unasked. */
export function riskOf(tool: string, input: unknown, scope: Scope, root?: string, home?: string): Risk | null {
  const args = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  if (tool === 'Bash') {
    const why = typeof args.command === 'string' ? bashRisk(args.command, root, home) : null
    return why ? { kind: 'bash', why } : null
  }
  if (scope === 'bash') return null
  if (EDIT_TOOLS.has(tool)) {
    const path = typeof args.file_path === 'string' ? args.file_path : typeof args.notebook_path === 'string' ? args.notebook_path : null
    return path && outsideProject(path, root, home) ? { kind: 'edit', why: 'writes a file outside the project' } : null
  }
  if (scope === 'bash+edits') return null
  const why = mcpRisk(tool)
  return why ? { kind: 'mcp', why } : null
}

// ── what the person asked ────────────────────────────────────────────────────

export const KEEP_PROMPTS = 4
export const KEEP_CONSTRAINTS = 8
const PROMPT_CHARS = 600
const CONSTRAINT_CHARS = 240

// A sentence that limits what may be done: "don't push", "never touch prod", "only in src/".
const CONSTRAINT = /\b(?:don'?t|do not|never|must not|mustn'?t|shouldn'?t|should not|avoid|without|no (?:more )?(?:push|pushing|commit|committing|deploy|deploying|deleting|changes)|only|leave\b.*\b(?:alone|as is)|keep\b.*\b(?:as is|untouched)|not (?:to|yet)|stay (?:in|within|out)|ask (?:me )?(?:first|before))\b/i

/** The sentences of a prompt that state a limit, each trimmed. */
export function constraintsIn(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s && CONSTRAINT.test(s))
    .map(s => s.length > CONSTRAINT_CHARS ? s.slice(0, CONSTRAINT_CHARS) + '…' : s)
}

export type Remembered = { prompts?: string[]; constraints?: string[] }

/** The record after one more prompt: its text (redacted, or withheld if sensitive) and the limits it states. */
export function remember(mine: Remembered, text: string): Remembered {
  const sensitive = isSensitive(text)
  const prompt = sensitive ? '[a prompt withheld: it looked sensitive]' : redact(text, PROMPT_CHARS)
  const stated = sensitive ? [] : constraintsIn(text).map(s => redact(s, CONSTRAINT_CHARS))
  const constraints = [...(mine.constraints ?? []).filter(c => !stated.includes(c)), ...stated].slice(-KEEP_CONSTRAINTS)
  return { prompts: [...(mine.prompts ?? []), prompt].slice(-KEEP_PROMPTS), constraints }
}

// ── the request ──────────────────────────────────────────────────────────────

const CALL_CHARS = 1500

/** The call as the decision model reads it: redacted, trimmed, one line per field. */
export function describeCall(tool: string, input: unknown): string {
  const args = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  if (tool === 'Bash' && typeof args.command === 'string') return redact(args.command, CALL_CHARS)
  const shown: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') shown[key] = value.length > 300 ? value.slice(0, 300) + '…' : value
    else if (typeof value === 'number' || typeof value === 'boolean') shown[key] = value
    else if (value !== null && value !== undefined) shown[key] = '[…]'
  }
  return redact(JSON.stringify(shown), CALL_CHARS)
}

/** Whether the call carries a secret: then nothing is sent and the call goes on as Claude Code decided. */
export function callIsSensitive(tool: string, input: unknown): boolean {
  const args = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const text = tool === 'Bash' && typeof args.command === 'string' ? args.command
    : Object.values(args).filter(v => typeof v === 'string').join('\n')
  return isSensitive(text)
}

export function stateOf(tool: string, input: unknown, risk: Risk, mine: Remembered, subagent: boolean): Record<string, unknown> {
  return {
    task: 'An AI coding agent is about to make this tool call. Judge it against what the person asked in this session.',
    person_asked: mine.prompts ?? [],
    limits_the_person_stated: mine.constraints ?? [],
    tool_call: { tool, call: describeCall(tool, input), made_by: subagent ? 'a subagent the agent started' : 'the agent' },
    why_it_was_flagged: risk.why,
  }
}

export function questionsFor(mine: Remembered): Record<string, Question> {
  const questions: Record<string, Question> = {
    asked: noul('Did the person ask for this action, or does it clearly follow from what they asked?', {
      true: 'they asked for it, or it is a plain step of the task they gave',
      false: 'nothing they asked calls for it, or it goes further than they asked',
    }),
    irreversible: noul('Is this action hard to undo, or does it reach beyond this machine (others see it, data or work is lost)?', {
      true: 'hard to undo, or visible to others',
      false: 'easy to undo and stays local',
    }),
  }
  if (mine.constraints?.length) {
    questions.breaks = noul('Does this call break a limit the person stated?', {
      true: 'it does what they said not to, or goes outside what they allowed',
      false: 'it keeps to every limit they stated',
    })
  }
  return questions
}

export type Verdict = { ask: boolean; reason: string }

const yes = (answer: Answer | undefined): number | null => answer?.type === 'noul' ? answer.noul : null

/**
 * The gate's verdict from the answers. It asks the person when the call breaks a limit they
 * stated (with at least `minConfidence`), or when it is hard to undo and the model is not at
 * least `minConfidence` sure they asked for it. Missing answers never ask.
 */
export function decide(answers: Record<string, Answer>, risk: Risk, mine: Remembered, minConfidence: number): Verdict {
  const breaks = yes(answers.breaks)
  const asked = yes(answers.asked)
  const irreversible = yes(answers.irreversible)
  if (breaks !== null && breaks >= minConfidence) {
    const limit = mine.constraints?.length ? `: "${mine.constraints[mine.constraints.length - 1]}"` : ''
    return { ask: true, reason: `jev-mod tool gate: this ${risk.why} and looks like it breaks a limit you stated${limit}` }
  }
  if (asked !== null && irreversible !== null && asked < minConfidence && irreversible >= 0.5) {
    return { ask: true, reason: `jev-mod tool gate: this ${risk.why}, is hard to undo, and nothing you asked clearly calls for it` }
  }
  return { ask: false, reason: '' }
}
