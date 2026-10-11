// Checks routing's task bench without spending anything: every hidden check fails on the fixture
// as shipped and passes on a known-good fix, and the whole task runner works end to end with a
// fake `claude` on PATH that applies those fixes (and says it answered on Haiku when routing is
// on, Opus when it is off). The fake run's rows go to bench/fake/task-fake.fake.jsonl.
//
//   bun src/features/routing/bench/task-selfcheck.ts
//   bun src/features/routing/bench/task-selfcheck.ts apply <case> <folder>    # what the fake claude calls

import { VERSION } from '../../../version'
import { fs, proc, repoRoot, run, say, warn } from '../../../bench/node'
import { armsFor } from '../../../bench/plan'
import { runTasks } from '../../../bench/task'
import { fakeDir } from '../../../bench/features'
import { task } from './task'
import { FIXTURE, TASKS } from './task-cases'

type Edit = { file: string; from: string; to: string; all?: true } | { file: string; write: string }

const EXPRESS_TEST = `import unittest

from parcel.quote import quote


class ExpressTest(unittest.TestCase):
    def test_express_adds_forty_percent_to_freight(self):
        q = quote("6011", 2.5, express=True)
        self.assertEqual(q.freight, 2038)
        self.assertEqual(q.total, q.subtotal + q.gst)
`

/** A known-good fix for each case: what a correct arm might do. The lookup case edits nothing. */
export const GOLD: Record<string, { edits: Edit[]; answer?: string }> = {
  'typo-message': { edits: [{ file: 'parcel/zones.py', from: 'Unknwon', to: 'Unknown', all: true }] },
  'rename-function': { edits: ['parcel/rates.py', 'parcel/quote.py', 'tests/test_rates.py', 'README.md']
    .map(file => ({ file, from: 'calc_price', to: 'freight_price', all: true as const })) },
  'lb-conversion': { edits: [{ file: 'parcel/units.py', from: 'return lb / KG_PER_LB', to: 'return lb * KG_PER_LB' }] },
  'lookup-quote': { edits: [], answer: 'That box is charged at 6 kg volumetric: $35.41 including GST.' },
  'express-option': { edits: [
    { file: 'parcel/quote.py', from: 'from parcel.rates import calc_price', to: 'from parcel.money import round_half_up\nfrom parcel.rates import calc_price' },
    { file: 'parcel/quote.py', from: 'dims_cm: tuple[float, float, float] | None = None) -> Quote:', to: 'dims_cm: tuple[float, float, float] | None = None, express: bool = False) -> Quote:' },
    { file: 'parcel/quote.py', from: '    freight = calc_price(zone, kg)\n', to: '    freight = calc_price(zone, kg)\n    if express:\n        freight = round_half_up(freight * 140, 100)\n' },
    { file: 'parcel/cli.py', from: '    q = quote(args.to, weight, args.dims)', to: '    q = quote(args.to, weight, args.dims, express=args.express)' },
    { file: 'parcel/cli.py', from: '    q.add_argument("--dims", type=parse_dims, help="LxWxH in cm")', to: '    q.add_argument("--dims", type=parse_dims, help="LxWxH in cm")\n    q.add_argument("--express", action="store_true")' },
    { file: 'tests/test_express.py', write: EXPRESS_TEST },
  ] },
  'report-by-zone': { edits: [
    { file: 'parcel/report.py', from: 'def render(s: Summary) -> str:', to: 'def by_zone(rows: list[dict[str, str]]) -> list[str]:\n    """One line per zone."""\n    zones: dict[str, list[int]] = {}\n    for r in rows:\n        q = quote_row(r)\n        zones.setdefault(q.zone, []).append(q.total)\n    return [f"{z}: {len(t)} parcels, {format_nzd(sum(t))}" for z, t in sorted(zones.items())]\n\n\ndef render(s: Summary) -> str:' },
    { file: 'parcel/cli.py', from: '    print(render(summarise(read_rows(args.csv))))', to: '    rows = read_rows(args.csv)\n    print(render(summarise(rows)))\n    if args.by_zone:\n        from parcel.report import by_zone\n        print("\\n".join(by_zone(rows)))' },
    { file: 'parcel/cli.py', from: '    r.add_argument("csv")', to: '    r.add_argument("csv")\n    r.add_argument("--by-zone", action="store_true")' },
    { file: 'tests/test_by_zone.py', write: 'import unittest\n\nfrom parcel.report import by_zone\n\n\nclass ByZoneTest(unittest.TestCase):\n    def test_by_zone(self):\n        self.assertEqual(by_zone([{"postcode": "1010", "weight_kg": "1.8"}]), ["A: 1 parcels, $9.65"])\n' },
  ] },
  'public-holidays': { edits: [
    { file: 'parcel/dates.py', from: 'from datetime import date, datetime, time, timedelta\n', to: 'import os\nfrom datetime import date, datetime, time, timedelta\n\nHOLIDAYS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "holidays.txt")\n\n\ndef load_holidays(path: str = HOLIDAYS_FILE) -> frozenset[date]:\n    """The holidays a file lists."""\n    with open(path, encoding="utf-8") as f:\n        return frozenset(date.fromisoformat(s.strip()) for s in f if s.strip() and not s.startswith("#"))\n\n\nHOLIDAYS = load_holidays()\n' },
    { file: 'parcel/dates.py', from: '    return d.weekday() < 5', to: '    return d.weekday() < 5 and d not in HOLIDAYS' },
    { file: 'tests/test_holidays.py', write: 'import unittest\nfrom datetime import date, datetime\n\nfrom parcel.dates import estimate_delivery\n\n\nclass HolidayTest(unittest.TestCase):\n    def test_labour_day(self):\n        self.assertEqual(estimate_delivery(datetime(2026, 10, 23, 10, 0), 1), date(2026, 10, 27))\n' },
  ] },
  'gst-rounding': { edits: [
    { file: 'parcel/quote.py', from: 'from parcel.rates import calc_price', to: 'from parcel.money import gst as gst_on\nfrom parcel.rates import calc_price' },
    { file: 'parcel/quote.py', from: 'gst = round(subtotal * 0.15)', to: 'gst = gst_on(subtotal)' },
    { file: 'parcel/report.py', from: 'gst=round(subtotal * 0.15)', to: 'gst=sum(q.gst for q in quotes)' },
    { file: 'tests/test_gst.py', write: 'import unittest\n\nfrom parcel.quote import quote\n\n\nclass GstTest(unittest.TestCase):\n    def test_half_cent_rounds_up(self):\n        self.assertEqual(quote("6011", 13.5).gst, 671)\n' },
  ] },
  'weekend-eta': { edits: [
    { file: 'parcel/dates.py', from: '    if booked.time() >= CUTOFF:', to: '    if booked.time() >= CUTOFF or not is_business_day(d):' },
    { file: 'parcel/cli.py', from: '.replace(tzinfo=NZ).astimezone(timezone.utc)', to: '' },
  ] },
  'report-total': { edits: [
    { file: 'parcel/report.py', from: '    postcode = str(int(row["postcode"]))  # the export pads some postcodes with spaces\n    return quote(postcode, float(row["weight_kg"]))',
      to: '    postcode = row["postcode"].strip()\n    dims = (float(row["length_cm"]), float(row["width_cm"]), float(row["height_cm"]))\n    return quote(postcode, float(row["weight_kg"]), dims)' },
  ] },
}

export async function applyGold(id: string, folder: string): Promise<void> {
  const f = await fs()
  for (const e of GOLD[id]?.edits ?? []) {
    const path = `${folder}/${e.file}`
    if ('write' in e) { await f.writeFile(path, e.write); continue }
    const text = await f.readFile(path, 'utf8')
    if (!text.includes(e.from)) throw new Error(`${id}: ${e.file} has no ${JSON.stringify(e.from.slice(0, 40))}`)
    await f.writeFile(path, e.all ? text.split(e.from).join(e.to) : text.replace(e.from, e.to))
  }
}

async function copyFixture(base: string, name: string): Promise<string> {
  const f = await fs()
  const dir = `${base}/${name}`
  await f.mkdir(dir, { recursive: true })
  await f.cp(`${repoRoot()}/${FIXTURE}`, dir, { recursive: true })
  for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=b', '-c', 'user.email=b@example.invalid', 'commit', '-q', '-m', 'fixture']]) {
    await run('git', args, { cwd: dir, timeoutMs: 30_000 })
  }
  return dir
}

/** Each check fails on the fixture as shipped and passes on its gold fix. */
async function checkGold(base: string): Promise<string[]> {
  const problems: string[] = []
  for (const t of TASKS) {
    const before = await task.check(t, '', await copyFixture(base, `${t.id}-before`))
    const fixed = await copyFixture(base, `${t.id}-gold`)
    await applyGold(t.id, fixed)
    const after = await task.check(t, GOLD[t.id]?.answer ?? 'Done.', fixed)
    say(`${t.id} (${t.difficulty}): as shipped ${before.success ? 'PASSES' : 'fails'} (${before.score.toFixed(2)}), ` +
      `gold ${after.success ? 'passes' : 'FAILS'} (${after.score.toFixed(2)}) ${JSON.stringify(after.detail)}`)
    if (before.success) problems.push(`${t.id}: the fixture as shipped already passes`)
    if (!after.success || after.score !== 1) problems.push(`${t.id}: the gold fix does not pass`)
  }
  return problems
}

const FAKE_CLAUDE = (selfcheck: string) => `#!/bin/sh
# A fake claude -p: applies the case's gold fix in the current folder and prints claude's JSON.
overlay="$JEV_MOD_BENCH_OVERLAY"
case_id=$(basename "$(dirname "$overlay")")
if grep -q '"routing":{"mode":"on"' "$overlay"; then model=claude-haiku-4-5-20251001; cost=0.05; else model=claude-opus-5-5; cost=0.4; fi
bun "${selfcheck}" apply "$case_id" "$PWD" >/dev/null || exit 1
answer=$(bun "${selfcheck}" answer "$case_id")
printf '{"type":"result","subtype":"success","is_error":false,"result":"%s","session_id":"fake-%s","total_cost_usd":%s,"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":0,"cache_creation_input_tokens":30000},"modelUsage":{"%s":{"costUSD":%s}}}\\n' "$answer" "$case_id" "$cost" "$model" "$cost"
`

/** The task runner end to end on the fake claude: twenty rows, every one a success, each naming its model. */
async function fakeRun(base: string): Promise<string[]> {
  const f = await fs()
  const bin = `${base}/bin`
  await f.mkdir(bin, { recursive: true })
  const selfcheck = `${repoRoot()}/src/features/routing/bench/task-selfcheck.ts`
  await f.writeFile(`${bin}/claude`, FAKE_CLAUDE(selfcheck))
  await run('chmod', ['+x', `${bin}/claude`])
  const out = `${repoRoot()}/${fakeDir('routing')}/task-fake.fake.jsonl`
  await f.mkdir(`${repoRoot()}/${fakeDir('routing')}`, { recursive: true })
  await f.writeFile(out, '')
  const date = new Date().toISOString()
  const meta = { schema: 1 as const, run: `${date}-fake`, feature: 'routing', level: 'task' as const, jevmod: VERSION, git: 'fake', date, settings: {}, sweep: null }
  const path = proc.env.PATH
  proc.env.PATH = `${bin}:${path}`
  proc.env.TMPDIR = base
  let rows
  try {
    rows = await runTasks({ adapter: task, arms: armsFor(task, ['openrouter'], null, {}), cases: TASKS, meta, repo: repoRoot(), out,
      claudeArgs: [], maxUsdPerCall: 1, timeoutMs: 60_000 })
  } finally { proc.env.PATH = path }
  // the fake's rows are marked so nothing reads them as real
  const text = await f.readFile(out, 'utf8')
  await f.writeFile(out, text.split('\n').filter(Boolean).map(l => JSON.stringify({ ...JSON.parse(l), fake: true })).join('\n') + '\n')
  const problems: string[] = []
  const armRows = rows.filter(r => !r.setup)
  if (armRows.length !== TASKS.length * 2) problems.push(`fake run: ${armRows.length} arm rows, not ${TASKS.length * 2}`)
  for (const r of armRows) {
    const want = r.arm === 'claude' ? 'claude-opus-5-5' : 'claude-haiku-4-5-20251001'
    if (r.outcome !== 'ok' || !r.success) problems.push(`fake run: ${r.case} · ${r.arm}: ${r.outcome} ${r.error ?? ''} success=${r.success}`)
    if (!r.claude_models || !(want in r.claude_models)) problems.push(`fake run: ${r.case} · ${r.arm} names no ${want}`)
  }
  say(`fake run: ${armRows.filter(r => r.success).length}/${armRows.length} arm runs succeeded; rows in ${out}`)
  return problems
}

async function main(): Promise<number> {
  const [cmd, id, folder] = proc.argv.slice(2)
  if (cmd === 'apply' && id && folder) { await applyGold(id, folder); return 0 }
  if (cmd === 'answer' && id) { say(GOLD[id]?.answer ?? 'Done.'); return 0 }
  const f = await fs()
  const base = await f.mkdtemp(`${proc.env.TMPDIR || '/tmp'}/routing-selfcheck-`)
  const problems = [...await checkGold(base), ...await fakeRun(base)]
  await f.rm(base, { recursive: true, force: true })
  for (const p of problems) warn(p)
  say(problems.length ? `${problems.length} problem(s)` : 'all checks fair: each fails as shipped and passes when fixed; the fake run went end to end')
  return problems.length ? 1 : 0
}

main().then(code => { proc.exitCode = code }, error => { warn(String((error as Error)?.stack ?? error)); proc.exitCode = 1 })
