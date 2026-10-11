// Routing's task-level tables and plot by difficulty, from the task rows in results/ (or fake/).
//
//   bun src/features/routing/bench/task-report.ts            # results/task-*.jsonl -> results/task-routing.md, task-routing.svg
//   bun src/features/routing/bench/task-report.ts --fake     # fake/task-*.fake.jsonl -> fake/task-routing-fake.md, .svg

import { fakeDir, resultsDir } from '../../../bench/features'
import { fs, proc, repoRoot, say } from '../../../bench/node'
import { fromLines } from '../../../bench/results'
import { markdown, plot } from './task-summary'

async function main(): Promise<number> {
  const fake = proc.argv.includes('--fake')
  const f = await fs()
  const dir = `${repoRoot()}/${fake ? fakeDir('routing') : resultsDir('routing')}`
  const names = (await f.readdir(dir).catch(() => [] as string[]))
    .filter(n => n.startsWith('task-') && (fake ? n.endsWith('.fake.jsonl') : n.endsWith('.jsonl') && !n.endsWith('.fake.jsonl'))).sort()
  const rows = []
  for (const n of names) rows.push(...fromLines(await f.readFile(`${dir}/${n}`, 'utf8')).rows.filter(r => fake || !r.fake))
  if (!rows.length) { say(`routing: no task rows in ${dir}`); return 0 }
  const suffix = fake ? '-fake' : ''
  await f.writeFile(`${dir}/task-routing${suffix}.md`, markdown(rows, `Routing, task level${fake ? ' (FAKE: a fake claude, not a measurement)' : ''}: ${names.join(', ')}`))
  await f.writeFile(`${dir}/task-routing${suffix}.svg`, plot(rows, fake))
  say(`wrote ${dir}/task-routing${suffix}.md and .svg from ${rows.length} rows`)
  return 0
}

main().then(code => { proc.exitCode = code })
