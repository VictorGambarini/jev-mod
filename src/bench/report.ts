// Read a feature's results and write its plots, its summary table and the recommended settings.
// See README.md in this folder.
//
//   bun src/bench/report.ts compact                     # results/ → results/*.svg, summary.md, the README's bench block
//   bun src/bench/report.ts compact --fake              # fake/ → fake/*-fake.svg, summary-fake.md; the README is left alone
//   bun src/bench/report.ts compact --suggest-tuning    # also print the recommended thresholds as settings to paste
//   bun src/bench/report.ts all                         # every feature with a bench
//
// It never writes the person's config: --suggest-tuning prints, and the person pastes.

import { BENCHES, benchDir, fakeDir, resultsDir } from './features'
import { fs, proc, repoRoot, say, warn } from './node'
import { fromLines } from './results'
import { insertBetweenMarkers, markdown, plots, suggestTuning, summarise } from './summary'
import type { Row } from './types'

async function report(feature: string, fake: boolean, tuning: boolean, readme: boolean): Promise<number> {
  const adapter = BENCHES[feature]?.decision
  if (!adapter) { warn(`no bench for ${feature}`); return 2 }
  const f = await fs()
  const repo = repoRoot()
  const dir = `${repo}/${fake ? fakeDir(feature) : resultsDir(feature)}`
  const names = (await f.readdir(dir).catch(() => [] as string[])).filter(n => (fake ? n.endsWith('.fake.jsonl') : n.endsWith('.jsonl') && !n.endsWith('.fake.jsonl')))
  if (!names.length) { say(`${feature}: no ${fake ? 'fake ' : ''}results in ${dir}`); return 0 }
  const rows: Row[] = []
  for (const name of names.sort()) {
    const { rows: mine, skipped } = fromLines(await f.readFile(`${dir}/${name}`, 'utf8'))
    if (skipped) warn(`${name}: ${skipped} line(s) were not result rows`)
    rows.push(...mine.filter(r => fake || !r.fake))
  }
  const s = summarise(adapter, rows, fake)
  const svgs = plots(adapter, s)
  const suffix = fake ? '-fake' : ''
  const images: Record<string, string> = {}
  for (const [name, svg] of Object.entries(svgs)) {
    await f.writeFile(`${dir}/${name}${suffix}.svg`, svg + '\n')
    images[name] = `bench/${fake ? 'fake' : 'results'}/${name}${suffix}.svg`
  }
  const block = markdown(adapter, s, images)
  // summary.md sits beside the plots, so its image links are relative to that folder
  await f.writeFile(`${dir}/summary${suffix}.md`, `# ${adapter.title}: bench summary${fake ? ' (FAKE backend)' : ''}\n\n` +
    markdown(adapter, s, Object.fromEntries(Object.entries(images).map(([k, v]) => [k, v.split('/').pop()!]))) + '\n')
  say(`${feature}: ${rows.length} row(s) → ${Object.keys(svgs).length} plot(s) and summary${suffix}.md in ${dir}`)
  if (!fake || readme) {
    const path = `${repo}/${benchDir(feature).replace(/\/bench$/, '')}/README.md`
    const text = await f.readFile(path, 'utf8').catch(() => null)
    const next = text === null ? null : insertBetweenMarkers(text, block)
    if (next === null) say(`  ${path.slice(repo.length + 1)}: no <!-- bench:start --> / <!-- bench:end --> markers; left alone`)
    else if (next !== text) { await f.writeFile(path, next); say(`  ${path.slice(repo.length + 1)}: bench block updated`) }
  }
  for (const line of s.backends.filter(b => b.recommended)) say(`  ${line.key}: recommended ${adapter.threshold.name} ${line.recommended!.threshold}`)
  if (tuning) say('\n' + suggestTuning(adapter, s) + '\n')
  return 0
}

async function main(): Promise<number> {
  const args = proc.argv.slice(2)
  const fake = args.includes('--fake')
  const tuning = args.includes('--suggest-tuning')
  const readme = args.includes('--readme')
  const named = args.filter(a => !a.startsWith('--'))
  if (named.length !== 1) {
    warn(`usage: bun src/bench/report.ts <feature|all> [--fake] [--suggest-tuning] [--readme]\nfeatures: ${Object.keys(BENCHES).join(', ')}`)
    return 2
  }
  const features = named[0] === 'all' ? Object.keys(BENCHES) : named
  let code = 0
  for (const feature of features) code = Math.max(code, await report(feature, fake, tuning, readme))
  return code
}

main().then(code => { proc.exitCode = code }, error => { warn(String((error as Error)?.stack ?? error)); proc.exitCode = 1 })
