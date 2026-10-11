// Runs the ten task projects for real, outside the mod's test environment (it needs python3, go
// and node): each project must fail its check as shipped, and pass once the known fix is applied,
// even when the tests were emptied (the checker puts the originals back).
//
//   bun src/features/trim-output/bench/check-fixtures.ts

import { fs, proc, repoRoot, run, say, warn } from '../../../bench/node'
import { checkWork } from './task-check'
import { TASKS } from './task'

// The edit that fixes each project: [file, from, to]. A project fixed this way must pass its check.
const FIXES: Record<string, [string, string, string][]> = {
  'slugify-letters': [['slugger/slug.py', '"þ": "th"}', '"þ": "th", "ø": "o", "ł": "l", "đ": "d"}']],
  'tax-refunds': [['shop/tax.py', 'return (amount_cents * rate_bp + 5000) // 10000',
    'x = amount_cents * rate_bp\n    q = (abs(x) + 5000) // 10000\n    return q if x >= 0 else -q']],
  'month-ends': [['billing/calendar_utils.py', 'last = DAYS_IN_MONTH[month - 1]', 'import calendar\n    last = calendar.monthrange(year, month)[1]']],
  'csv-quotes': [['csvlite/parser.py', '            if ch == \'"\':\n                quoted = False\n            else:\n                field.append(ch)',
    '            if ch == \'"\':\n                if pending:\n                    field.append(\'"\')\n                    pending = False\n                else:\n                    pending = True\n            else:\n                if pending:\n                    quoted = False\n                    pending = False\n                    if ch == ",":\n                        fields.append("".join(field))\n                        field = []\n                        continue\n                    field.append(ch)\n                    continue\n                field.append(ch)'],
    ['csvlite/parser.py', '    quoted = False\n    for ch', '    quoted = False\n    pending = False\n    for ch']],
  'prerelease-order': [['vercmp/compare.py', '        if x != y:\n            return -1 if x < y else 1',
    '        if x != y:\n            if x.isdigit() and y.isdigit():\n                return -1 if int(x) < int(y) else 1\n            if x.isdigit() != y.isdigit():\n                return -1 if x.isdigit() else 1\n            return -1 if x < y else 1']],
  'pib-sizes': [['sizes.go', '"PIB": 1 << 40,', '"PIB": 1 << 50,']],
  'lru-falsy': [['src/lru.js', 'if (value) {', 'if (this.map.has(key)) {']],
  'build-template': [['templates/invoice.html', '| dat }}', '| date }}']],
}


async function scratch(id: string): Promise<{ work: string; t: (typeof TASKS)[number] }> {
  const f = await fs()
  const t = TASKS.find(x => x.id === id)!
  const base = await f.mkdtemp(`${proc.env.TMPDIR || '/tmp'}/trim-task-check-`)
  await f.cp(`${repoRoot()}/${t.fixture}`, `${base}/p`, { recursive: true })
  return { work: `${base}/p`, t }
}

const failures: string[] = []
const expectThat = (name: string, ok: boolean, why: string) => { if (!ok) failures.push(`${name}: ${why}`) }

async function main(): Promise<number> {
  const f = await fs()
  for (const id of Object.keys(FIXES)) {
    const { work, t } = await scratch(id)
    const before = await checkWork(t, '', work)
    const tests = t.check.kind === 'tests'
    expectThat(id, !before.success && before.score < 1 && (!tests || before.score > 0.9), `shipped project should fail (a test run with a score just under 1), got ${JSON.stringify(before)}`)
    for (const [file, from, to] of FIXES[id]!) {
      const text = await f.readFile(`${work}/${file}`, 'utf8')
      expectThat(id, text.includes(from), `${file} lacks the text the fix replaces`)
      await f.writeFile(`${work}/${file}`, text.replace(from, to))
    }
    if ((t.check as { restore: string[] }).restore[0] === 'tests') await f.writeFile(`${work}/tests/cases.json`, '[]')
    const after = await checkWork(t, '', work)
    expectThat(id, after.success && after.score === 1, `fixed project should pass, got ${JSON.stringify(after)}`)
    say(`${id}: shipped ${before.score.toFixed(3)} -> fixed ${after.score}`)
  }
  {
    const { work, t } = await scratch('migration-order')
    expectThat('migration-order', !(await checkWork(t, '', work)).success, 'shipped migrations should fail')
    await run('sh', ['-c', 'mv db/migrations/0197_index_t003_events_region.sql db/migrations/0199_index_t003_events_region.sql'], { cwd: work, timeoutMs: 10_000 })
    expectThat('migration-order', (await checkWork(t, '', work)).success, 'the renamed migration should pass')
    say('migration-order: shipped fails -> renamed passes')
  }
  for (const [id, argv, min] of [['slugify-letters', ['python3', '-m', 'pytest', '-v', '-p', 'no:cacheprovider'], 400],
    ["migration-order", ["python3", "tools/migrate.py", "--dry-run"], 500], ['pool-timeouts', ['python3', 'tools/replay.py', 'logs/trace.jsonl'], 1000]] as const) {
    const { work } = await scratch(id)
    const r = await run(argv[0], argv.slice(1), { cwd: work, timeoutMs: 120_000 })
    const n = `${r.stdout}${r.stderr}`.split('\n').length
    expectThat(id, n > min, `prints ${n} lines, wanted more than ${min}`)
    say(`${id}: ${n} lines`)
  }
  for (const m of failures) warn(`FAIL ${m}`)
  say(failures.length ? `${failures.length} problem(s)` : 'all ten projects behave')
  return failures.length ? 1 : 0
}

main().then(code => { proc.exitCode = code }, error => { warn(String((error as Error)?.stack ?? error)); proc.exitCode = 1 })
