// Offline benchmark cases for output trimming of test logs: a log, the goal and command it is
// read for, and the gold lines the trimmed output must still hold. The logs are built here, so
// they are exact and small to keep; their shape is what vitest, jest, pytest and go test print.
//
// Gold is what a person with the goal could not do without: the failure, the summary, and the
// passing tests or the one warning the goal is about. "Keep failures only" cannot know the latter.

export type Case = {
  name: string
  command: string
  /** The latest request, as the decision model reads it. */
  goal: string
  log: string
  /** Lines that must be in the trimmed output (compared by trimmed text). */
  gold: string[]
}

const MODULES = ['parser', 'auth', 'billing', 'cache', 'router', 'search', 'session', 'export', 'queue', 'i18n', 'upload', 'layout']
const CASES_PER = 14
const TOPICS = ['handles empty input', 'rejects bad input', 'keeps order', 'is idempotent', 'trims whitespace', 'reads defaults',
  'writes defaults', 'survives retries', 'maps ids', 'formats dates', 'merges options', 'closes handles', 'reports sizes', 'skips hidden']

/** vitest: a banner, per-module console output and passing tests, one failing parser test, the summary. */
function vitest(): Case {
  const out: string[] = []
  const gold: string[] = []
  out.push('> app@1.0.0 test', '> vitest run', '', ' RUN  v1.6.0 /home/me/app', '')
  for (const mod of MODULES) {
    out.push(`stdout | src/${mod}.test.ts > ${mod} > setup`, `[${mod}] loaded fixtures from test/data/${mod}.json`, '')
    if (mod === 'parser') {
      const warn = '[parser] warning: option "lenient" is deprecated, use "mode: lenient" instead'
      out.push(`stderr | src/${mod}.test.ts > ${mod} > setup`, warn, '')
      gold.push(warn)
    }
    const file = ` ✓ src/${mod}.test.ts (${CASES_PER} tests) ${40 + mod.length}ms`
    if (mod === 'parser') out.push(` ❯ src/parser.test.ts (${CASES_PER} tests | 1 failed) 14ms`)
    else out.push(file)
    for (let t = 0; t < CASES_PER; t++) {
      const line = `   ✓ ${mod} > ${TOPICS[t]} ${2 + t}ms`
      if (mod === 'parser' && t === 3) out.push('   × parser > parses nested arrays', '')
      else out.push(line)
      if (mod === 'parser' && t !== 3) gold.push(line)
    }
    out.push('')
  }
  const failure = [' FAIL  src/parser.test.ts > parser > parses nested arrays', 'AssertionError: expected [ 1, [ 2 ] ] to deeply equal [ 1, [ 2, 3 ] ]',
    ' ❯ src/parser.test.ts:42:18', '    at parseNested (src/parser.ts:88:11)']
  const summary = [' Test Files  1 failed | 11 passed (12)', '      Tests  1 failed | 167 passed (168)']
  out.push('⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯', '', failure[0]!, failure[1]!, '', '- Expected', '+ Received', '', failure[2]!, '     41|     const got = parse("[1,[2,3]]")', failure[3]!, '',
    '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯', '', summary[0]!, summary[1]!, '   Start at  10:42:01', '   Duration  4.21s (transform 310ms, setup 0ms, collect 1.2s, tests 2.9s)')
  gold.push(...failure, ...summary)
  return { name: 'vitest', command: 'npx vitest run', goal: 'fix the failing parser test, and check that the other parser tests still pass', log: out.join('\n') + '\n', gold }
}

/** jest: PASS/FAIL per file, one failing auth test, a console warning about sessions, the summary. */
function jest(): Case {
  const out: string[] = []
  const gold: string[] = []
  out.push('> app@1.0.0 test', '> jest', '')
  for (const mod of MODULES) {
    if (mod === 'auth') out.push(`FAIL src/${mod}.test.js`)
    else out.push(`PASS src/${mod}.test.js`)
    out.push(`  ${mod}`)
    for (let t = 0; t < CASES_PER; t++) {
      const line = `    ✓ ${TOPICS[t]} (${1 + t} ms)`
      if (mod === 'auth' && t === 5) out.push('    ✕ refuses an expired token (4 ms)')
      else out.push(line)
      if (mod === 'session' && t < 3) gold.push(line)
    }
    if (mod === 'session') {
      const warn = '    session store is in-memory; tokens are lost on restart'
      out.push('', '  console.warn', warn)
      gold.push(warn)
    }
    out.push('')
  }
  const failure = ['  ● auth › refuses an expired token', '    expect(received).toBe(expected) // Object.is equality', '    Expected: 401', '    Received: 200']
  const summary = ['Test Suites: 1 failed, 11 passed, 12 total', 'Tests:       1 failed, 167 passed, 168 total']
  out.push(...failure, '', '      at Object.<anonymous> (src/auth.test.js:57:30)', '', summary[0]!, summary[1]!, 'Snapshots:   0 total', 'Time:        3.412 s', 'Ran all test suites.')
  gold.push(...failure, '      at Object.<anonymous> (src/auth.test.js:57:30)', ...summary)
  return { name: 'jest', command: 'npm test', goal: 'why does the auth test fail? also tell me whether the session tests pass and what they warn about', log: out.join('\n') + '\n', gold }
}

/** pytest -v: one long run of PASSED lines, one failing billing test, the short summary. */
function pytest(): Case {
  const out: string[] = []
  const gold: string[] = []
  out.push('============================= test session starts ==============================', 'platform linux -- Python 3.12.3, pytest-8.2.0', 'rootdir: /home/me/app',
    `collected ${MODULES.length * CASES_PER} items`, '')
  let done = 0
  for (const mod of MODULES) {
    for (let t = 0; t < CASES_PER; t++) {
      const pct = Math.floor((++done / (MODULES.length * CASES_PER)) * 100)
      const name = `tests/test_${mod}.py::test_${TOPICS[t]!.replace(/ /g, '_')}`
      if (mod === 'billing' && t === 2) out.push(`${name} FAILED`.padEnd(70) + `[${String(pct).padStart(3)}%]`)
      else out.push(`${name} PASSED`.padEnd(70) + `[${String(pct).padStart(3)}%]`)
      if (mod === 'cache' && t < 4) gold.push(out[out.length - 1]!)
    }
    if (mod === 'cache') {
      const warn = 'tests/test_cache.py:88: UserWarning: cache directory /tmp/cache was created with mode 0777'
      out.push('', warn, '')
      gold.push(warn)
    }
  }
  const failure = ['_______________________ test_keeps_order _______________________', 'E       AssertionError: assert 3 == 2', 'tests/test_billing.py:61: AssertionError']
  const summary = ['=========================== short test summary info ============================', 'FAILED tests/test_billing.py::test_keeps_order - AssertionError: assert 3 == 2',
    '======================== 1 failed, 167 passed in 4.82s =========================']
  out.push('', '=================================== FAILURES ===================================', ...failure, ...summary)
  gold.push(...failure, ...summary)
  return { name: 'pytest', command: 'python -m pytest -v', goal: 'the billing test fails; does the cache suite still pass, and what warning does it raise?', log: out.join('\n') + '\n', gold }
}

/** go test -v: RUN/PASS pairs per test with log output, one failing router test, per-package results. */
function go(): Case {
  const out: string[] = []
  const gold: string[] = []
  for (const mod of MODULES) {
    for (let t = 0; t < CASES_PER; t++) {
      const test = `Test${mod[0]!.toUpperCase()}${mod.slice(1)}${t}`
      out.push(`=== RUN   ${test}`)
      if (mod === 'router' && t === 4) out.push(`--- FAIL: ${test} (0.00s)`, '    router_test.go:77: got 404, want 200')
      else out.push(`--- PASS: ${test} (0.00s)`)
      if (mod === 'queue' && t < 3) gold.push(out[out.length - 1]!)
    }
    if (mod === 'queue') {
      const log = '2026/10/11 10:42:01 queue: dropped 3 messages older than 24h'
      out.push(log)
      gold.push(log)
    }
    out.push(mod === 'router' ? `FAIL\texample.com/app/${mod}\t0.012s` : `ok  \texample.com/app/${mod}\t0.01${mod.length}s`)
  }
  const failure = ['--- FAIL: TestRouter4 (0.00s)', '    router_test.go:77: got 404, want 200']
  out.push('FAIL')
  gold.push(...failure, 'FAIL\texample.com/app/router\t0.012s', 'FAIL')
  return { name: 'go test', command: 'go test -v ./...', goal: 'fix the router failure; I also want to know whether the queue tests pass and what the queue logged', log: out.join('\n') + '\n', gold }
}

export const CASES: Case[] = [vitest(), jest(), pytest(), go()]
