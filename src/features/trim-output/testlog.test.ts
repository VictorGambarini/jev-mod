import { test, expect } from 'claude-code/testing'
import { CASES } from '../../../evals/trim-tests/fixtures'
import {
  chunks, commandKey, detect, dropOnly, failures, hash, MAX_FAILURES, nameList, oneRequest, parse, remembered, unchanged,
  type Runner,
} from './testlog'
import { fold, linesOf } from './trim'

const SAMPLES: { runner: Runner; command: string; lines: string[]; names: string[] }[] = [
  { runner: 'vitest', command: 'npx vitest run', names: ['b.test.ts > b > breaks'], lines: ['> vitest run', '', ' ✓ a.test.ts (1 test) 3ms', '   ✓ a > works 1ms',
    ' ❯ b.test.ts (1 test | 1 failed) 4ms', '   × b > breaks', '', ' FAIL  b.test.ts > b > breaks', 'AssertionError: expected 1 to be 2', '  at b.test.ts:3:1', '',
    ' Test Files  1 failed | 1 passed (2)', '      Tests  1 failed | 1 passed (2)', '   Duration  1s'] },
  { runner: 'jest', command: 'npm test', names: ['b › breaks'], lines: ['> jest', '', 'PASS a.test.js', '  ✓ ok (1 ms)', 'FAIL b.test.js', '  ✕ breaks (2 ms)', '',
    '  ● b › breaks', '', '    expect(received).toBe(expected)', '', 'Test Suites: 1 failed, 1 passed, 2 total', 'Tests:       1 failed, 1 passed, 2 total', 'Time: 1 s'] },
  { runner: 'pytest', command: 'pytest -v', names: ['test_bad'], lines: ['=== test session starts ===', 'collected 2 items', '', 'test_a.py::test_ok PASSED     [ 50%]',
    'test_a.py::test_bad FAILED    [100%]', '', '=== FAILURES ===', '___ test_bad ___', 'E   assert 1 == 2', 'test_a.py:5: AssertionError', '=== short test summary info ===',
    'FAILED test_a.py::test_bad - assert 1 == 2', '=== 1 failed, 1 passed in 0.12s ===', 'x'] },
  { runner: 'go', command: 'go test ./...', names: ['TestB'], lines: ['=== RUN   TestA', '--- PASS: TestA (0.00s)', '=== RUN   TestB', '--- FAIL: TestB (0.00s)',
    '    b_test.go:7: got 1 want 2', 'FAIL', 'FAIL\texample.com/x\t0.01s', 'x', 'y', 'z'] },
  { runner: 'cargo', command: 'cargo test', names: ['b'], lines: ['running 2 tests', 'test a ... ok', 'test b ... FAILED', '', 'failures:', '', '---- b stdout ----',
    "thread 'b' panicked at src/lib.rs:5", 'assertion failed', '', 'failures:', '    b', '', 'test result: FAILED. 1 passed; 1 failed; 0 ignored', '', 'x', 'y'] },
  { runner: 'bun', command: 'bun test', names: [], lines: ['bun test v1.1', '', 'a.test.ts:', '(pass) a > ok [0.1ms]', 'error: expect(received).toBe(expected)',
    '(fail) a > bad [0.2ms]', '', '1 pass', '1 fail', 'Ran 2 tests across 1 files. [5ms]'] },
  { runner: 'node', command: 'node --test', names: ['b'], lines: ['TAP version 13', 'ok 1 - a', 'not ok 2 - b', '  ---', '  error: boom', '  ...', '1..2', '# tests 2', '# pass 1', '# fail 1'] },
  { runner: 'mocha', command: 'npx mocha', names: ['a'], lines: ['> mocha', '', '  a', '    ✓ works', '    1) breaks', '', '  1 passing (5ms)', '  1 failing', '', '  1) a',
    '       breaks:', '     AssertionError: expected 1 to equal 2', '      at Context.<anonymous> (test.js:5:10)', '', 'x', 'y', 'z', 'w', 'v'] },
]

test('each runner is detected from its own summary line and a command that runs tests', () => {
  for (const s of SAMPLES) expect(detect(s.lines, s.command)).toBe(s.runner)
})

test('detection is conservative: the command and the output must both say so', () => {
  const vitest = SAMPLES[0]!
  expect(detect(vitest.lines, 'cat vitest.log')).toBe(null)          // a command that only reads a log
  expect(detect(vitest.lines, 'grep -n FAIL out.txt')).toBe(null)
  expect(detect(vitest.lines, 'ls')).toBe(null)                       // neither a runner nor a test command
  expect(detect(vitest.lines, 'npx jest')).toBe(null)                 // names another runner than the output's
  expect(detect(['> vitest run', 'all fine', 'Tests 4 total'], 'npx vitest run')).toBe(null) // no summary line
  expect(detect(vitest.lines, 'npm run test')).toBe('vitest')         // a package script: the output says which
})

test('parse: every runner splits into contiguous blocks, with its failures named', () => {
  for (const s of SAMPLES) {
    const log = parse(s.lines, s.command)!
    expect(log.runner).toBe(s.runner)
    expect(log.blocks[0]!.start).toBe(0)
    expect(log.blocks[log.blocks.length - 1]!.end).toBe(s.lines.length - 1)
    for (let i = 1; i < log.blocks.length; i++) expect(log.blocks[i]!.start).toBe(log.blocks[i - 1]!.end + 1)
    expect(log.blocks.filter(b => b.kind === 'fail' && b.name !== undefined).map(b => b.name)).toEqual(s.names)
    expect(log.blocks[log.blocks.length - 1]!.kind).toBe('summary')
    expect(log.blocks.some(b => b.kind === 'fail')).toBe(true)
  }
})

test('parse: passing tests, other output, failures and the summary are told apart', () => {
  const c = CASES[0]!
  const lines = linesOf(c.log)
  const log = parse(lines, c.command)!
  const of = (kind: string) => log.blocks.filter(b => b.kind === kind).map(b => lines.slice(b.start, b.end + 1))
  expect(of('pass').every(b => b.every(l => /✓|^$/.test(l)))).toBe(true)
  expect(of('pass').length).toBeGreaterThan(10)
  // console output is its own block, and the failure and the summary are never "other"
  expect(of('other').some(b => b.some(l => l.includes('loaded fixtures')))).toBe(true)
  expect(of('other').every(b => b.every(l => !l.includes('AssertionError')))).toBe(true)
  expect(of('fail').some(b => b.some(l => l.startsWith('AssertionError')))).toBe(true)
  expect(of('summary')[of('summary').length - 1]!.some(l => l.includes('Tests  1 failed'))).toBe(true)
  // a passing test called "rejects an error" is still a passing test
  const odd = parse(['> vitest run', '', ' ✓ a.test.ts (1 test) 3ms', '   ✓ a > rejects an error 1ms', ' ✓ b.test.ts', ' ✓ c.test.ts', ' ✓ d.test.ts', ' ✓ e.test.ts',
    ' Test Files  5 passed (5)', '      Tests  5 passed (5)', '   Duration  1s', 'x', 'y'], 'vitest')!
  expect(odd.blocks.some(b => b.kind === 'pass' && b.start <= 3 && b.end >= 3)).toBe(true)
})

test('parse: a heading between passing tests joins them; a warning does not', () => {
  const lines = ['> jest', '', 'PASS a.test.js', '  group a', '  ✓ one (1 ms)', '  ✓ two (1 ms)', '  console.warn', '  ✓ three (1 ms)',
    'Test Suites: 1 passed, 1 total', 'Tests:       3 passed, 3 total', 'Time: 1 s', 'x', 'y']
  const log = parse(lines, 'npm test')!
  expect(log.blocks.map(b => [b.kind, b.start, b.end])).toEqual([['summary', 0, 1], ['pass', 2, 5], ['other', 6, 6], ['pass', 7, 7], ['summary', 8, 12]])
})

test('parse: the first and last lines are always summary, and a long block is cut at the chunk size', () => {
  const lines = ['> vitest run', ...Array.from({ length: 100 }, (_, i) => ` ✓ t${i}.test.ts (1 test) 1ms`), ' Test Files  100 passed (100)', '      Tests  100 passed (100)', 'a', 'b', 'c']
  const log = parse(lines, 'vitest run')!
  expect(log.blocks[0]).toEqual({ kind: 'summary', start: 0, end: 1 })
  expect(log.blocks.filter(b => b.kind === 'pass').every(b => b.end - b.start + 1 <= 40)).toBe(true)
  expect(log.blocks.filter(b => b.kind === 'pass').length).toBe(3)
})

test('failures: identical ones match across runs whatever the durations; any change in the text does not', () => {
  const c = CASES[0]!
  const lines = linesOf(c.log)
  const log = parse(lines, c.command)!
  const prev = remembered(lines, log)
  expect(Object.keys(prev)).toEqual(['src/parser.test.ts > parser > parses nested arrays'])
  expect(unchanged(lines, log, prev).map(s => s.names)).toEqual([['src/parser.test.ts > parser > parses nested arrays']])
  // a slower run of the same failure
  const slow = lines.map(l => l.replace('14ms', '99ms').replace('4.21s', '9.9s').replace('(0.00s)', '(0.13s)'))
  expect(unchanged(slow, parse(slow, c.command)!, prev).length).toBe(1)
  // a different assertion, or a different line number
  const edited = lines.map(l => l.replace('[ 1, [ 2, 3 ] ]', '[ 1, [ 2, 4 ] ]'))
  expect(unchanged(edited, parse(edited, c.command)!, prev)).toEqual([])
  const moved = lines.map(l => l.replace('src/parser.test.ts:42:18', 'src/parser.test.ts:43:18'))
  expect(unchanged(moved, parse(moved, c.command)!, prev)).toEqual([])
  // a failure the previous run did not have
  expect(unchanged(lines, log, {})).toEqual([])
})

test('failures: repeated names are numbered, neighbours join into one range, the memory is bounded', () => {
  const lines = ['> jest', '', '  ● t', '    boom', '  ● t', '    boom 2', '  ● u', '    boom 3', 'Test Suites: 1 failed', 'Tests: 3 failed', 'Time: 1s', 'x', 'y']
  const log = parse(lines, 'npm test')!
  expect(failures(lines, log).map(f => f.name)).toEqual(['t', 't #2', 'u'])
  const all = remembered(lines, log)
  expect(unchanged(lines, log, all)).toEqual([{ start: 2, end: 7, names: ['t', 't #2', 'u'] }])
  const many = ['> jest', '', ...Array.from({ length: 150 }, (_, i) => [`  ● test ${i}`, `    boom ${i}`]).flat(), 'Test Suites: 1 failed', 'Tests: 150 failed', 'Time: 1s', 'x', 'y']
  expect(Object.keys(remembered(many, parse(many, 'npm test')!)).length).toBe(MAX_FAILURES)
})

test('names in a marker: a few, then a count', () => {
  expect(nameList(['a', 'b'])).toBe('a, b')
  expect(nameList(Array.from({ length: 11 }, (_, i) => `t${i}`))).toBe('t0, t1, t2, t3, t4, t5, t6, t7 and 3 more')
  expect(nameList(['x'.repeat(300)]).length).toBeLessThan(130)
})

test('the command is kept as a hash, the same for the same command however it is spaced', () => {
  expect(commandKey('npx  vitest run ')).toBe(commandKey('npx vitest run'))
  expect(commandKey('npx vitest run')).not.toBe(commandKey('npx vitest run src/a.test.ts'))
  expect(commandKey('curl -H "Authorization: Bearer abc" x')).not.toContain('abc')
  expect(hash('a')).not.toBe(hash('b'))
})

test('chunks: failures and the summary are kept, passing and other blocks are for the decision model', () => {
  const c = CASES[0]!
  const lines = linesOf(c.log)
  const log = parse(lines, c.command)!
  const rows = fold(lines)
  const cs = chunks(rows, log)
  expect(cs[0]!.start).toBe(0)
  expect(cs[cs.length - 1]!.end).toBe(rows.length - 1)
  for (let i = 1; i < cs.length; i++) expect(cs[i]!.start).toBe(cs[i - 1]!.end + 1)
  const text = (i: number) => rows.slice(cs[i]!.start, cs[i]!.end + 1).map(r => r.text).join('\n')
  cs.forEach((ch, i) => {
    if (text(i).includes('AssertionError') || text(i).includes('Tests  1 failed')) expect(ch.keep).toBe(true)
    if (text(i).includes('✓ parser > ')) expect(ch.keep).toBe(false)
  })
  expect(cs.filter(ch => !ch.keep).length).toBeGreaterThan(10)
})

test('only a "not needed" of 0.9 or more drops a block', () => {
  const m = dropOnly(new Map([[0, 0.1], [1, 0.11], [2, 0.0], [3, 0.5], [4, 1]]))
  expect([0, 1, 2, 3, 4].map(i => m.get(i))).toEqual([0, 1, 0, 1, 1])
})

test('one request holds as many blocks as fit, in order', () => {
  const texts = new Map(Array.from({ length: 300 }, (_, i) => [i, 'x'.repeat(200)] as const))
  const ids = oneRequest(texts, t => t.length + 16)
  expect(ids).toEqual(Array.from({ length: ids.length }, (_, i) => i))
  expect(ids.length).toBeLessThanOrEqual(120)
  expect(oneRequest(new Map([[5, 'a'], [9, 'b']]), t => t.length)).toEqual([5, 9])
  expect(oneRequest(new Map([[0, 'x'.repeat(50_000)]]), t => t.length)).toEqual([])
})
