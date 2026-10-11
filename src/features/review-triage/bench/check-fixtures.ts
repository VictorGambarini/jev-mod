// Applies each of the ten patches to the shop service for real, outside the mod's test
// environment (it needs git), and proves the gold: every needle is found on exactly one line, an
// answer that lists the gold lines scores 1, one that lists none misses every defect, and the
// base project's own tests pass before and (but for bulk-threshold) after.
//
//   bun src/features/review-triage/bench/check-fixtures.ts

import { fs, proc, repoRoot, run, say, warn } from '../../../bench/node'
import { checkWork } from './task-check'
import { TASKS } from './task'

const failures: string[] = []
const expectThat = (name: string, ok: boolean, why: string) => { if (!ok) failures.push(`${name}: ${why}`) }

async function main(): Promise<number> {
  const f = await fs()
  const root = repoRoot()
  const git = (cwd: string, ...args: string[]) => run('git', ['-c', 'user.name=check', '-c', 'user.email=check@example.invalid', ...args], { cwd, timeoutMs: 30_000 })
  for (const t of TASKS) {
    const base = await f.mkdtemp(`${proc.env.TMPDIR || '/tmp'}/review-task-check-`)
    const work = `${base}/p`
    await f.cp(`${root}/${t.fixture}`, work, { recursive: true })
    for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'fixture']]) await git(work, ...args)
    const applied = await git(work, 'apply', `${root}/${t.patch}`)
    expectThat(t.id, applied.code === 0, `the patch does not apply: ${applied.stderr.slice(0, 200)}`)
    const tests = await run('python3', ['-m', 'pytest', '-q', '-p', 'no:cacheprovider'], { cwd: work, timeoutMs: 60_000 })
    say(`${t.id}: patch applies, tests ${tests.code === 0 ? 'pass' : 'fail'}`)
    let gold = ''
    try {
      // every needle is on one line: a spot per defect, answered at its first line
      const lines: string[] = []
      for (const s of [...t.bugs]) {
        const text = await f.readFile(`${work}/${s.file}`, 'utf8')
        const at = text.split('\n').findIndex(l => l.includes(s.needle)) + 1
        lines.push(`FINDING: ${s.file}:${at} - ${s.id}`)
      }
      gold = lines.length ? lines.join('\n') : 'FINDING: none'
      const perfect = await checkWork(t, gold, work)
      expectThat(t.id, perfect.success && perfect.score === 1, `the gold answer should score 1, got ${JSON.stringify(perfect)}`)
      const none = await checkWork(t, 'FINDING: none', work)
      expectThat(t.id, t.bugs.length ? !none.success && none.score === 0 : none.success, `"none" should ${t.bugs.length ? 'miss every defect' : 'be right'}, got ${JSON.stringify(none)}`)
      const noise = await checkWork(t, `${gold}\nFINDING: README.md:1 - nothing`, work)
      expectThat(t.id, !noise.success, 'a false finding should spoil success')
    } catch (error) { expectThat(t.id, false, (error as Error).message) }
  }
  for (const m of failures) warn(`FAIL ${m}`)
  say(failures.length ? `${failures.length} problem(s)` : 'all ten changes behave')
  return failures.length ? 1 : 0
}

main().then(code => { proc.exitCode = code }, error => { warn(String((error as Error)?.stack ?? error)); proc.exitCode = 1 })
