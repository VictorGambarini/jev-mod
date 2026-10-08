import { test, expect } from 'claude-code/testing'
import {
  changed, chunk, chunkText, drop, fold, isProtected, isStackFrame, linesOf, MIN_CHUNK_LINES, CHUNK_LINES, pack,
  render, request, shapeOf, type Row,
} from './trim'

const PATH = '/cache/jev-mod/outputs/1.txt'
const show = (rows: Row[]) => render(rows, 0, PATH).split('\n').slice(1)

// A noisy vitest-like run: install noise, hundreds of passing tests, a progress spinner, one
// failure with its diff and stack, and the summary.
function vitestLog(): { text: string; required: string[] } {
  const out: string[] = []
  out.push('> app@1.0.0 test', '> vitest run', '')
  for (let i = 0; i < 40; i++) out.push(`npm http fetch GET 200 https://registry.npmjs.org/pkg-${i} ${10 + i}ms (cache hit)`)
  out.push('')
  out.push(' RUN  v1.6.0 /home/me/app', '')
  for (let f = 0; f < 30; f++) {
    out.push(` ✓ src/module${f}.test.ts (12 tests) ${100 + f}ms`)
    for (let t = 0; t < 12; t++) out.push(`   ✓ module${f} > case ${t} handles input ${t * 7} ${3 + t}ms`)
  }
  for (let i = 0; i < 60; i++) out.push('⠋ Running tests...')
  const required = [
    ' ❯ src/parser.test.ts (3 tests | 1 failed) 14ms',
    '   × parser > parses nested arrays',
    'AssertionError: expected [ 1, [ 2 ] ] to deeply equal [ 1, [ 2, 3 ] ]',
    '- Expected',
    '+ Received',
    ' ❯ src/parser.test.ts:42:18',
    '    at parseNested (src/parser.ts:88:11)',
    ' Test Files  1 failed | 30 passed (31)',
    '      Tests  1 failed | 362 passed (363)',
  ]
  out.push(required[0], required[1], '')
  out.push('⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯', '')
  out.push(' FAIL  src/parser.test.ts > parser > parses nested arrays', required[2], '', required[3], required[4], '')
  out.push('  [', '    1,', '    [', '      2,', '-     3,', '    ],', '  ]', '')
  out.push(required[5], '     40|   it("parses nested arrays", () => {', '     41|     const got = parse("[1,[2,3]]")', required[6], '')
  out.push(required[7], required[8], '   Start at  10:42:01', '   Duration  4.21s (transform 310ms, setup 0ms, collect 1.2s, tests 2.9s)')
  return { text: out.join('\n') + '\n', required }
}

// A pytest-like run with a long passing preamble, a warnings block and two failures.
function pytestLog(): { text: string; required: string[] } {
  const out: string[] = ['============================= test session starts ==============================',
    'platform linux -- Python 3.12.3, pytest-8.2.0, pluggy-1.5.0', 'rootdir: /home/me/proj', 'collected 812 items', '']
  for (let i = 0; i < 400; i++) out.push(`tests/test_api.py::test_endpoint_${i} PASSED                          [ ${String(Math.floor(i / 8.12)).padStart(2)}%]`)
  for (let i = 0; i < 50; i++) out.push(`2026-10-09 10:42:${String(i % 60).padStart(2, '0')},123 DEBUG urllib3.connectionpool: Starting new HTTPS connection (1): example.com:443`)
  const required = [
    'tests/test_db.py::test_migrate FAILED                                   [ 99%]',
    '    def test_migrate(db):',
    '>       assert db.version == 7',
    'E       assert 6 == 7',
    'tests/test_db.py:31: AssertionError',
    'FAILED tests/test_db.py::test_migrate - assert 6 == 7',
    '=================== 1 failed, 811 passed, 3 warnings in 12.34s ===================',
  ]
  out.push(required[0], '', '=================================== FAILURES ===================================',
    '________________________________ test_migrate _________________________________', '', required[1], required[2], required[3], '',
    required[4], '=========================== short test summary info ============================', required[5], required[6])
  return { text: out.join('\n') + '\n', required }
}

test('protected lines: errors, failures, warnings, stack frames, summaries and exit codes', () => {
  for (const line of ['ERROR: boom', 'npm ERR! code 1', 'Traceback (most recent call last):', '  File "a.py", line 3, in f',
    '    at Object.<anonymous> (/x/y.js:1:2)', 'src/a.ts:12:5 - error TS2322', '3 passed, 1 failed in 0.2s', 'Exit code 2',
    ' Test Files  1 failed | 2 passed (3)', 'warning: unused variable', 'E       assert 1 == 2', '   × parser > nested',
    'not ok 3 - handles empty', 'panic: runtime error', 'FAILED tests/a.py::t'])
    expect(isProtected(line)).toBe(true)
  for (const line of ['line 1', ' ✓ src/a.test.ts (3 tests) 4ms', 'tests/test_a.py::test_x PASSED   [ 10%]',
    'npm http fetch GET 200 https://x 10ms', 'Compiling foo v0.1.0', ''])
    expect(isProtected(line)).toBe(false)
  expect(isStackFrame('    at f (src/a.ts:3:4)')).toBe(true)
  expect(isStackFrame('ERROR: boom')).toBe(false)
})

test('a shape reads numbers, hashes and timestamps alike', () => {
  expect(shapeOf('line 1')).toBe(shapeOf('line 4999'))
  expect(shapeOf('2026-10-09 10:42:01 GET /a 12ms')).toBe(shapeOf('2026-10-09 10:43:59 GET /a 7ms'))
  expect(shapeOf('built deadbeefcafe in 3s')).toBe(shapeOf('built 0123456789ab in 41s'))
  expect(shapeOf('GET /a')).not.toBe(shapeOf('GET /b'))
})

test('linesOf: a final newline makes no empty last line', () => {
  expect(linesOf('a\nb\n')).toEqual(['a', 'b'])
  expect(linesOf('a\r\nb')).toEqual(['a', 'b'])
  expect(linesOf('')).toEqual([''])
})

test('fold: identical runs repeat, similar runs keep their ends, protected and pinned lines stay', () => {
  const lines = ['head', 'second', ...Array(5).fill('same'), ...Array.from({ length: 10 }, (_, i) => `line ${i}`),
    'ERROR: one 1', 'ERROR: one 2', 'ERROR: one 3', '', '', '', 'x', 'y', 'z', 'w', 'tail']
  const rows = fold(lines)
  expect(show(rows)).toEqual(['head', 'second', 'same  (repeated 5 times)', 'line 0',
    `[jev-mod: 8 similar lines folded — ${PATH} lines 9–16]`, 'line 9',
    'ERROR: one 1', 'ERROR: one 2', 'ERROR: one 3', '', 'x', 'y', 'z', 'w', 'tail'])
  // every original line is accounted for, in order
  expect(rows[0].from).toBe(1)
  expect(rows[rows.length - 1].to).toBe(lines.length)
  for (let i = 1; i < rows.length; i++) expect(rows[i].from).toBe(rows[i - 1].to + 1)
  expect(changed(rows)).toBe(true)
  expect(changed(fold(['a', 'b', 'c']))).toBe(false)
})

test('fold: two similar lines are left as they are, identical protected lines still repeat', () => {
  expect(show(fold(['a', 'b', 'x 1', 'x 2', 'c', 'd', 'e', 'f', 'g']))).toEqual(['a', 'b', 'x 1', 'x 2', 'c', 'd', 'e', 'f', 'g'])
  expect(show(fold(['a', 'b', 'warning: w', 'warning: w', 'warning: w', '1', '2', '3', '4', '5']))[2])
    .toBe('warning: w  (repeated 3 times)')
})

test('the live check: 5000 numbered lines and an error fold to a handful', () => {
  const text = Array.from({ length: 5000 }, (_, i) => `line ${i + 1}`).join('\n') + '\nERROR: boom\n'
  const rows = fold(linesOf(text))
  const out = show(rows)
  expect(out).toEqual(['line 1', 'line 2', 'line 3', `[jev-mod: 4992 similar lines folded — ${PATH} lines 4–4995]`,
    'line 4996', 'line 4997', 'line 4998', 'line 4999', 'line 5000', 'ERROR: boom'])
})

test('a noisy vitest run: folding alone keeps every failure line and saves most of it', () => {
  const { text, required } = vitestLog()
  const rows = fold(linesOf(text))
  const out = render(rows, linesOf(text).length, PATH)
  for (const line of required) expect(out.split('\n')).toContain(line)
  expect(out.length).toBeLessThan(text.length * 0.6)
})

test('a pytest run: folding alone keeps both failures and the summary', () => {
  const { text, required } = pytestLog()
  const rows = fold(linesOf(text))
  const out = render(rows, linesOf(text).length, PATH)
  for (const line of required) expect(out.split('\n')).toContain(line)
  expect(out.length).toBeLessThan(text.length * 0.25)
})

test('chunks: cut at blank lines and headers, packed to a size, protected chunks marked keep', () => {
  const { text } = vitestLog()
  const rows = fold(linesOf(text))
  const chunks = chunk(rows)
  // contiguous, complete
  expect(chunks[0].start).toBe(0)
  expect(chunks[chunks.length - 1].end).toBe(rows.length - 1)
  for (let i = 1; i < chunks.length; i++) expect(chunks[i].start).toBe(chunks[i - 1].end + 1)
  for (const c of chunks) {
    expect(c.end - c.start + 1).toBeLessThanOrEqual(CHUNK_LINES)
    expect(c.keep).toBe(rows.slice(c.start, c.end + 1).some(r => r.keep))
  }
  // all but the pinned first and last, and the one closed early by the last, stand for the minimum of original lines
  expect(chunks.slice(1, -2).every(c => rows[c.end].to - rows[c.start].from + 1 >= MIN_CHUNK_LINES)).toBe(true)
  // every row holding a required line is in a kept chunk
  const failing = rows.findIndex(r => r.text.startsWith('AssertionError'))
  expect(chunks.find(c => c.start <= failing && failing <= c.end)!.keep).toBe(true)
})

test('drop: low-scored chunks become one marker per run, kept and unanswered chunks stay', () => {
  const lines = Array.from({ length: 60 }, (_, i) => `step ${String.fromCharCode(97 + (i % 26))}${i}`)
  lines[30] = 'Error: kept'
  const rows: Row[] = lines.map((text, i) => ({ kind: 'line', text, from: i + 1, to: i + 1, count: 1, keep: i === 30 }))
  const chunks = [{ start: 0, end: 9, keep: false }, { start: 10, end: 19, keep: false }, { start: 20, end: 29, keep: false },
    { start: 30, end: 39, keep: true }, { start: 40, end: 49, keep: false }, { start: 50, end: 59, keep: false }]
  const need = new Map([[0, 0.1], [1, 0.2], [2, 0.9], [3, 0.0], [4, 0.34]]) // chunk 5 unanswered
  const out = drop(rows, chunks, need, 0.35)
  const text = show(out)
  expect(text[0]).toBe(`[jev-mod: 20 lines omitted — full output: ${PATH} lines 1–20]`)
  expect(text).toContain('Error: kept') // a kept chunk is never dropped, whatever its score
  expect(text).toContain(`[jev-mod: 10 lines omitted — full output: ${PATH} lines 41–50]`)
  expect(text[text.length - 1]).toBe('step h59') // unanswered: kept
  expect(out.filter(r => r.kind === 'omitted').length).toBe(2)
  expect(drop(rows, chunks, new Map(), 0.35)).toEqual(rows)
})

test('a dropped run swallows folded rows and reports original line numbers; the first and last lines stay', () => {
  const lines = ['$ make', 'building', ...Array.from({ length: 50 }, (_, i) => `progress ${i}%`), '',
    'result: 42', 'checksum ok', 'artifact at dist/app', 'size 1.2MB', 'signed by ci', 'uploaded to cache', 'cleanup done', 'next steps none',
    'a', 'b', 'c', 'd', 'e']
  const rows = fold(lines)
  const chunks = chunk(rows)
  expect(chunks[0]).toEqual({ start: 0, end: 1, keep: true })            // the first lines, alone
  expect(chunks[chunks.length - 1].keep).toBe(true)                       // the last lines, alone
  const need = new Map(chunks.map((c, id) => [id, rows.slice(c.start, c.end + 1).some(r => r.text.startsWith('progress')) ? 0 : 1]))
  const text = show(drop(rows, chunks, need, 0.35))
  expect(text).toContain(`[jev-mod: 50 lines omitted — full output: ${PATH} lines 3–52]`)
  expect(text.slice(0, 2)).toEqual(['$ make', 'building'])
  expect(text).toContain('result: 42')
  expect(text[text.length - 1]).toBe('e')
})

test('render: one header line with the counts and the path', () => {
  const rows = fold(['a', 'b', ...Array(10).fill('x'), 'c', 'd', 'e', 'f', 'g'])
  const out = render(rows, 17, PATH).split('\n')
  expect(out[0]).toBe(`[jev-mod trimmed this output from 17 to ${out.length - 1} lines; the full output is in ${PATH}]`)
})

test('requests: packed by encoded size, every chunk asked by its own id with the goal and command', () => {
  const texts = new Map<number, string>()
  for (let i = 0; i < 100; i++) texts.set(i * 2, 'x'.repeat(1200))
  const batches = pack(texts)
  expect(batches.flat()).toEqual([...texts.keys()])
  expect(batches.length).toBeGreaterThan(2)
  expect(batches.every(b => b.length <= 40)).toBe(true)
  const { state, questions } = request('fix the parser test', 'npx vitest run', texts, batches[0])
  expect(Object.keys(questions)).toEqual(batches[0].map(id => `c${id}`))
  expect(Object.keys(state.chunks as object)).toEqual(batches[0].map(id => `C${id}`))
  expect(state.goal).toBe('fix the parser test')
  expect(questions.c0.type).toBe('noul')
  expect(String(questions.c2.instructions)).toContain('C2')
  expect(request('', 'ls', texts, [0]).state.goal).toBe('(not known)')
})

test('a chunk is read redacted and capped', () => {
  const rows: Row[] = [{ kind: 'line', text: 'token sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH', from: 1, to: 1, count: 1, keep: false },
    { kind: 'line', text: 'y'.repeat(5000), from: 2, to: 2, count: 1, keep: false }]
  const text = chunkText(rows, { start: 0, end: 1, keep: false })
  expect(text).not.toContain('sk-ant-api03')
  expect(text.length).toBeLessThan(1400)
})

test('measure: folding on the test logs', () => {
  for (const { text } of [vitestLog(), pytestLog()]) {
    const out = render(fold(linesOf(text)), linesOf(text).length, PATH)
    console.log(`folding: ${text.length} -> ${out.length} chars (${linesOf(text).length} -> ${linesOf(out).length} lines)`)
  }
})
