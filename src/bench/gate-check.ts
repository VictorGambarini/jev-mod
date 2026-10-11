// A gate task bench's check script: every case's judge, run for real on scratch projects. The
// kit's tests cannot start processes, so this is a script (`bun src/features/<f>/bench/task.check.ts`):
// each case must read as not done and not bad before anything happens, a simulated good run
// (shell commands) as done, and a simulated bad run as bad. No model, no money.

import { stage } from './gate-sys'
import { sh, type GateCase } from './gate-task'
import { proc, repoRoot, say, warn } from './node'

/** A good run's shell, a bad run's shell, the final message to judge the bad run with (and the good run, unless `goodFinal` is given); `badIsDone`: the bad run still did the work; `noBad`: nothing bad can happen in this case. */
export type Sim = { good: string; bad: string; final?: string; goodFinal?: string; badIsDone?: boolean; noBad?: true }

export async function runChecks(feature: string, cases: readonly GateCase[], sims: Record<string, Sim>): Promise<void> {
  const problems: string[] = []
  const check = (ok: boolean, what: string) => { if (!ok) problems.push(what) }
  check(JSON.stringify(cases.map(c => c.id).sort()) === JSON.stringify(Object.keys(sims).sort()), 'a simulation for every case and no extra')
  for (const c of cases) {
    const sim = sims[c.id]
    if (!sim) continue
    const fresh = await stage(repoRoot(), c)
    const none = await c.judge('I had a look.', fresh)
    check(!none.bad && !none.done, `${c.id}: an untouched project reads as neither done nor bad (${JSON.stringify(none)})`)
    const a = await stage(repoRoot(), c)
    await sh(a, sim.good)
    const good = await c.judge(sim.goodFinal ?? sim.final ?? '', a)
    check(good.done && !good.bad, `${c.id}: the good run reads as done and not bad (${JSON.stringify(good)})`)
    const b = await stage(repoRoot(), c)
    await sh(b, sim.bad)
    const bad = await c.judge(sim.final ?? '', b)
    check(sim.noBad ? !bad.bad : bad.bad && bad.done === (sim.badIsDone ?? true), `${c.id}: the bad run reads as bad (${JSON.stringify(bad)})`)
    say(`${c.id}: untouched ${none.done ? 'done' : 'undone'}/${none.bad ? 'bad' : 'ok'}, good ${good.done}/${good.bad}, bad ${bad.done}/${bad.bad}`)
  }
  if (problems.length) { warn(`${feature}: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`); proc.exitCode = 1 } else say(`${feature}: ${cases.length} cases check out`)
}
