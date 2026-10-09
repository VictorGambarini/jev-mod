import { test, expect } from 'claude-code/testing'
import type { Answer } from '../../engine/client'
import {
  changePieces, decide, describeChange, foldersDown, frontMatter, globMatches, lineDiff, parseRules, questionsFor, refusal,
  relativeTo, selectRules, stateOf, type Candidate,
} from './rules'

const RULES = `# Project

This repo is the jev-mod plugin. It has a long history and this paragraph only describes it, so it is prose and not a rule at all.

## Code style

- Use \`pnpm\`, never npm.
- Keep functions small and
  pure where you can.
* Never import \`$\` outside register.tsx.
1. Run the tests before every commit.
2) Write a test for each bug you fix.

Always say what a check printed.

\`\`\`ts
// - this list item is code
const x = 1
\`\`\`

### Naming

- Name tests after the behaviour they check.
- ok
| a table | row |
<!--
- a commented-out rule
-->
`

test('rules are list items, numbered items and short directives, each with its file and headings', () => {
  const { rules, paths } = parseRules(RULES, 'CLAUDE.md')
  expect(paths).toBe(null)
  expect(rules.map(r => r.text)).toEqual([
    'Use `pnpm`, never npm.',
    'Keep functions small and pure where you can.',
    'Never import `$` outside register.tsx.',
    'Run the tests before every commit.',
    'Write a test for each bug you fix.',
    'Always say what a check printed.',
    'Name tests after the behaviour they check.',
  ])
  expect(rules[0]!.heading).toBe('Project > Code style')
  expect(rules[6]!.heading).toBe('Project > Code style > Naming')
  expect(rules.every(r => r.source === 'CLAUDE.md')).toBe(true)
})

test('code blocks, headings, tables, comments, short items and long prose are not rules', () => {
  const texts = parseRules(RULES, 'CLAUDE.md').rules.map(r => r.text).join('\n')
  for (const gone of ['this list item is code', 'const x', 'Code style', 'a table', 'commented-out', 'ok', 'long history']) {
    expect(texts.includes(gone)).toBe(false)
  }
  const long = `- ${'word '.repeat(150)}`
  expect(parseRules(long, 'A.md').rules.length).toBe(0)
  // a long-ish list item is kept, cut to 300 characters
  const kept = parseRules(`- ${'Always check the thing. '.repeat(15)}`, 'A.md').rules
  expect(kept.length).toBe(1)
  expect(kept[0]!.text.length).toBe(300)
})

test('front-matter paths: lists, inline arrays and a single glob; none means everywhere', () => {
  expect(frontMatter('---\npaths:\n  - "src/**/*.ts"\n  - lib/**\n---\n- Use tabs here please.').paths).toEqual(['src/**/*.ts', 'lib/**'])
  expect(frontMatter('---\npaths: ["a/*.py", \'b/**\']\n---\n').paths).toEqual(['a/*.py', 'b/**'])
  expect(frontMatter('---\ndescription: x\npaths: docs/**\n---\n').paths).toEqual(['docs/**'])
  expect(frontMatter('---\ndescription: x\n---\n').paths).toBe(null)
  const file = parseRules('---\npaths:\n  - src/**\n---\n# Src\n- Always export a named function.', '.claude/rules/src.md')
  expect(file.paths).toEqual(['src/**'])
  expect(file.rules.map(r => `${r.heading}: ${r.text}`)).toEqual(['Src: Always export a named function.'])
})

test('globs match project-relative paths', () => {
  expect(globMatches(['src/**/*.ts'], 'src/a/b.ts')).toBe(true)
  expect(globMatches(['src/**/*.ts'], 'src/b.ts')).toBe(true)
  expect(globMatches(['src/**/*.ts'], 'lib/b.ts')).toBe(false)
  expect(globMatches(['src/*.ts'], 'src/a/b.ts')).toBe(false)
  expect(globMatches(['*.md'], 'docs/x/README.md')).toBe(true) // no slash: any depth
  expect(globMatches(['**/*.{ts,tsx}'], 'a/b.tsx')).toBe(true)
  expect(globMatches(['docs/'], 'docs/a/b.md')).toBe(true)
  expect(globMatches(['./test/?.ts'], 'test/a.ts')).toBe(true)
})

test('the folders read go from the root down to the file; outside the project is not judged', () => {
  expect(foldersDown('a/b/c.ts')).toEqual(['', 'a', 'a/b'])
  expect(foldersDown('c.ts')).toEqual([''])
  expect(relativeTo('/p', '/p/src/x.ts')).toBe('src/x.ts')
  expect(relativeTo('/p/', '/p/src/x.ts')).toBe('src/x.ts')
  expect(relativeTo('/p', '/pq/x.ts')).toBe(null)
  expect(relativeTo('/p', '/etc/x')).toBe(null)
})

const cand = (text: string, source: string, distance: number, order: number, heading = ''): Candidate =>
  ({ text, source, heading, distance, order })

test('more rules than the cap: the ones about this path and change are kept, nearer files first, in written order', () => {
  const rules = [
    cand('Database migrations must be reversible.', 'CLAUDE.md', 2, 0),
    cand('Keep the README table in step with the registry.', 'CLAUDE.md', 2, 1),
    cand('Parser functions must never throw on bad input.', 'CLAUDE.md', 2, 2),
    cand('Prefer small commits.', 'CLAUDE.md', 2, 3),
    cand('Prefer small commits.', 'src/AGENTS.md', 1, 4), // the same rule nearer: sent once, from here
    cand('Comment why, not what.', 'src/parser/CLAUDE.md', 0, 5),
  ]
  const all = selectRules(rules, 'src/parser/lexer.ts', 'function tokenize() {}', 25)
  expect(all.length).toBe(5)
  expect(all.find(r => r.text === 'Prefer small commits.')!.source).toBe('src/AGENTS.md')
  const three = selectRules(rules, 'src/parser/lexer.ts', 'function tokenize() {}', 3)
  expect(three.map(r => r.text)).toEqual([
    'Parser functions must never throw on bad input.', // the path's words
    'Prefer small commits.', // no words in common: nearer first
    'Comment why, not what.',
  ])
  const byChange = selectRules(rules, 'src/x.ts', 'ALTER TABLE users; // a migration', 1)
  expect(byChange.map(r => r.text)).toEqual(['Database migrations must be reversible.'])
})

test('the change: Edit old and new, Write as a diff against the file or whole when new, MultiEdit every edit', () => {
  expect(changePieces('Edit', { old_string: 'a', new_string: 'b' }, null)).toEqual([['old_string', 'a'], ['new_string', 'b']])
  expect(changePieces('Write', { content: 'x\ny' }, null)).toEqual([['new_file', 'x\ny']])
  const diff = changePieces('Write', { content: '1\n2\n3\nNEW\n5\n6\n7' }, '1\n2\n3\n4\n5\n6\n7')
  expect(diff).toEqual([['diff', '@@ line 4 @@\n 2\n 3\n-4\n+NEW\n 5\n 6']])
  expect(lineDiff('same', 'same')).toBe('')
  expect(changePieces('MultiEdit', { edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: 'd' }] }, null))
    .toEqual([['edit_1_old', 'a'], ['edit_1_new', 'b'], ['edit_2_old', 'c'], ['edit_2_new', 'd']])
  expect(changePieces('NotebookEdit', { new_source: 'print(1)', cell_id: 'c1' }, null)[1]).toEqual(['new_source', 'print(1)'])
})

test('the change is capped, shared between its pieces; a secret in it sends nothing', () => {
  const big = describeChange('a.ts', 'Edit', [['old_string', 'x'.repeat(10_000)], ['new_string', 'short one']], 2000)!
  expect(big.edit.new_string).toBe('short one')
  expect(big.edit.old_string!.length).toBeLessThan(2100)
  expect(describeChange('a.ts', 'Edit', [['old_string', ''], ['new_string', 'const password = "hunter22"']], 2000)).toBe(null)
  expect(describeChange('a.ts', 'Edit', [['old_string', ''], ['new_string', 'AKIAIOSFODNN7EXAMPLE']], 2000)).toBe(null)
})

test('one yes/no question per rule, naming the rule, its file and heading', () => {
  const rules = [cand('Use pnpm, never npm.', 'CLAUDE.md', 0, 0, 'Tooling'), cand('Comment why, not what.', 'src/AGENTS.md', 0, 1)]
  const q = questionsFor(rules)
  expect(Object.keys(q)).toEqual(['rule_1', 'rule_2'])
  expect(q.rule_1!.type).toBe('noul')
  expect(q.rule_1!.instructions).toBe('Does this change break this rule? Rule (from CLAUDE.md, under "Tooling"): "Use pnpm, never npm."')
  expect(q.rule_2!.instructions).toBe('Does this change break this rule? Rule (from src/AGENTS.md): "Comment why, not what."')
  expect(Object.keys(q.rule_1!.criteria as object)).toEqual(['true', 'false'])
  const state = stateOf({ file: 'src/a.ts', tool: 'Edit', edit: { old_string: 'a', new_string: 'b' }, text: '' }, false)
  expect(state.file).toBe('src/a.ts')
  expect(state.change).toEqual({ old_string: 'a', new_string: 'b' })
})

test('a rule judged broken at or above minConfidence refuses, quoting it; below passes; missing answers pass', () => {
  const rules = [cand('Use pnpm, never npm.', 'CLAUDE.md', 0, 0, 'Tooling'), cand('Comment why, not what.', 'src/AGENTS.md', 0, 1)]
  const noul = (p: number): Answer => ({ type: 'noul', noul: p })
  expect(decide({ rule_1: noul(0.79), rule_2: noul(0.1) }, rules, 0.8)).toEqual([])
  expect(decide({}, rules, 0.8)).toEqual([])
  const broken = decide({ rule_1: noul(0.8), rule_2: noul(0.95) }, rules, 0.8)
  expect(broken.map(b => b.rule.text)).toEqual(['Comment why, not what.', 'Use pnpm, never npm.'])
  const one = refusal('src/a.ts', broken.slice(1))
  expect(one).toContain('this edit to src/a.ts was not made')
  expect(one).toContain('- "Use pnpm, never npm." (CLAUDE.md, under "Tooling")')
  expect(one).toContain('tell the person which rule and why')
  expect(refusal('src/a.ts', broken)).toContain('breaks 2 rules')
})
