import { test, expect } from 'claude-code/testing'
import text from '../../test/parity/fixtures/skill_text'
import catalogs from '../../test/parity/fixtures/skill_catalogs'
import runs from '../../test/parity/fixtures/skills'
import type { Host } from './client'
import { pyRound } from './pyre'
import { discover, frontMatter, looksTrivial, pick, type Skill, type SkillFiles } from './skills'

type TextFixture = { trivial: { turn: string; trivial: boolean }[]; front_matter: { text: string; fields: Record<string, string> }[] }
type Exchange = { request: string; reply?: string; fail?: string }
type Run = { catalog: string; turn: string; top_k: number; values: unknown; exchanges: Exchange[]; result: Record<string, unknown> }

const sorted = (value: unknown): string => JSON.stringify(value ?? null, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1))) : v)

test('the trivial-turn gate answers as skillpick.looks_trivial did', () => {
  const cases = (text as unknown as TextFixture).trivial
  const wrong = cases.filter(c => looksTrivial(c.turn) !== c.trivial).map(c => ({ turn: c.turn, want: c.trivial }))
  expect(wrong).toEqual([])
  expect(cases.length).toBeGreaterThan(400)
})

test('front matter reads as skillpick._front_matter did', () => {
  const cases = (text as unknown as TextFixture).front_matter
  const wrong = cases.filter(c => sorted(frontMatter(c.text)) !== sorted(c.fields))
    .map(c => ({ text: c.text.slice(0, 120), got: frontMatter(c.text), want: c.fields }))
  expect(wrong).toEqual([])
})

test('round() is Python’s: exact ties to even, everything else to the nearest', () => {
  const xs = [0.0625, 0.1875, 0.3125, 0.5, 0.88, 0.8805, 0.123456, 0.9995, 0.0005, 1.0005, 0.4375, 2.5e-4, 0.999, 0.30000000000000004]
  expect(xs.map(x => pyRound(x, 3))).toEqual([0.062, 0.188, 0.312, 0.5, 0.88, 0.88, 0.123, 1.0, 0.001, 1.0, 0.438, 0.0, 0.999, 0.3])
})

/** The scripted backend, replayed: each request answered with the reply Python's got for the same body. */
function replay(run: Run, sent: string[]): Host {
  return {
    env: async name => (name === 'TYPESAFE_API_KEY' ? 'parity-capture-key-0123456789' : name === 'XDG_CONFIG_HOME' ? '/cfg' : undefined),
    readFile: async () => undefined, secret: async () => undefined, home: async () => '/home/x',
    now: () => 0, sleep: async () => {},
    post: async (_url, body) => {
      sent.push(body)
      const exchange = run.exchanges.find(e => e.request === body)
      if (!exchange || exchange.fail) throw new Error(exchange?.fail ?? 'unrecorded request')
      return { status: 200, text: exchange.reply as string, headers: {} }
    },
  }
}

test('pick sends the requests and reaches the picks skillpick.pick did', async () => {
  const wrong: unknown[] = []
  for (const [n, run] of (runs as unknown as Run[]).entries()) {
    const sent: string[] = []
    const got = await pick(replay(run, sent), run.turn, (catalogs as unknown as Record<string, Skill[]>)[run.catalog], { topK: run.top_k, backend: null })
    const { latency_ms: _l, calls: _c, errors: _e, ...result } = got
    const { latency_ms: _w, ...want } = run.result
    if (sorted(result) !== sorted(want)) wrong.push({ n, what: 'result', got: result, want })
    const expected = run.exchanges.map(e => e.request).sort()
    if (JSON.stringify([...sent].sort()) !== JSON.stringify(expected)) {
      wrong.push({ n, what: 'requests', got: sent.map(b => b.slice(0, 300)), want: expected.map(b => b.slice(0, 300)) })
    }
  }
  expect(wrong).toEqual([])
  expect((runs as unknown[]).length).toBeGreaterThan(45)
})

// ── finding skills: Claude Code's layout, not skillpick.discover's walk ───────

function tree(files: Record<string, string>): SkillFiles {
  return {
    folders: async root => [...new Set(Object.keys(files).filter(p => p.startsWith(`${root}/`))
      .map(p => p.slice(root.length + 1).split('/')).filter(parts => parts.length > 1).map(parts => parts[0]))],
    read: async path => files[path],
  }
}

const skill = (name: string | null, description: string | null) =>
  `---\n${name === null ? '' : `name: ${name}\n`}${description === null ? '' : `description: ${description}\n`}---\nbody\n`

test('discover reads one SKILL.md per folder directly under each root, as Claude Code does', async () => {
  const files = tree({
    '/p/.claude/skills/deploy/SKILL.md': skill('deploy', 'Project deploy.'),
    '/home/u/.claude/skills/deploy/SKILL.md': skill('deploy', 'User deploy, shadowed by the project.'),
    '/home/u/.claude/skills/review/SKILL.md': skill(null, 'Named after its folder.'),
    '/home/u/.claude/skills/renamed/SKILL.md': skill('chart', 'Named by its front matter.'),
    '/home/u/.claude/skills/bare/SKILL.md': skill('bare', null),
    '/home/u/.claude/skills/.hidden/SKILL.md': skill('hidden', 'A hidden folder.'),
    '/home/u/.claude/skills/meta/SKILL.md': skill('using-superpowers', 'A selector meta-skill.'),
    '/home/u/.claude/skills/off/SKILL.md': skill('off', 'Disabled.'),
    '/home/u/.claude/skills/gstack/test/fixtures/alpha/SKILL.md': skill('alpha', 'A test fixture two levels down.'),
    '/home/u/.claude/skills/gstack/openclaw/skills/investigate/SKILL.md': skill('gstack-openclaw-investigate', 'A copy.'),
    '/home/u/.claude/skills/notes/README.md': 'not a skill',
  })
  const found = await discover(files, ['/p/.claude/skills', '/home/u/.claude/skills'], ['off'])
  expect(found).toEqual([
    { name: 'deploy', description: 'Project deploy.', path: '/p/.claude/skills/deploy/SKILL.md' },
    { name: 'chart', description: 'Named by its front matter.', path: '/home/u/.claude/skills/renamed/SKILL.md' },
    { name: 'review', description: 'Named after its folder.', path: '/home/u/.claude/skills/review/SKILL.md' },
  ])
})
