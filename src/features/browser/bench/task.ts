// The browser's task-level bench (tasks.ts has the cases and the checker): for each arm, a fresh
// copy of the case's site is served on a loopback port (serve.ts), the arm's `claude -p` is given
// its browser tool (Playwright MCP, or jev-mod's browse), and the site's log is checked after. The
// row's detail keeps the site's trail of pages and actions, the answer, and each browser tool call
// with its answer (from the session's transcript), so a loss can be read afterwards.

import { fs, proc } from '../../../bench/node'
import type { ArmSetup, Step, TaskAdapter } from '../../../bench/types'
import { readLog, serveSite } from './serve'
import { armArgs, type BrowserTask, checkRun, chromiumPath, parseLog, playwrightConfig, REFUSED, TASKS, toolCalls, UNATTENDED } from './tasks'

// About what one task costs on the Claude side, for the estimate, from the 2026-10-11 smoke run
// (two cases on Opus): Playwright MCP $0.22-0.25 a case, browse $0.14-0.21; tasks with a login or
// a form take more turns, so both are priced above that.
const USD = { claude: 0.35, 'jev-mod': 0.3 }

/** Claude Code's transcripts of the sessions run in `dir`, joined; empty when there are none. */
export async function transcriptOf(dir: string): Promise<string> {
  const f = await fs()
  const home = proc.env.CLAUDE_CONFIG_DIR || `${proc.env.HOME ?? ''}/.claude`
  const folder = `${home}/projects/${dir.replace(/[^a-zA-Z0-9]/g, '-')}`
  const names = await f.readdir(folder).catch(() => [] as string[])
  const texts = await Promise.all(names.filter(n => n.endsWith('.jsonl')).map(n => f.readFile(`${folder}/${n}`, 'utf8').catch(() => '')))
  return texts.join('\n')
}

export const task: TaskAdapter<BrowserTask> = {
  feature: 'browser',
  cases: () => TASKS,
  steps: (t, arm): Step[] => [{ prompt: t.prompt + UNATTENDED, final: true, disallowedTools: REFUSED, usd: USD[arm.kind] }],
  overlay: arm => ({ features: { browser: { mode: arm.kind === 'jev-mod' ? 'on' : 'off' } } }),
  async beforeArm(t, arm, dir): Promise<ArmSetup> {
    const f = await fs()
    const site = serveSite(t.site, `${dir}/site-log.jsonl`)
    const config = `${dir}/mcp.json`
    await f.writeFile(config, arm.kind === 'claude' ? playwrightConfig(chromiumPath(proc.env.HOME ?? '')) : '{"mcpServers":{}}')
    return { vars: { base: site.base }, claudeArgs: armArgs(arm, config), stop: site.stop }
  },
  async check(t, finalText, workdir, armDir) {
    const checked = checkRun(t, finalText, parseLog(await readLog(`${armDir}/site-log.jsonl`)))
    // each browser tool call and what it answered, from the session's transcript, so a loss can be read afterwards
    return { ...checked, detail: { ...checked.detail, tool_calls: toolCalls(await transcriptOf(workdir)) } }
  },
  usdPerCall: 0.5,
  maxUsdPerCall: 3,
  // a browse call takes a step per page action (a request each, more when it confirms or checks the page)
  decisionCallsPerArm: 12,
  estimateNote: () => [`  priced at about $${USD.claude} a case with Playwright MCP and $${USD['jev-mod']} with browse, above the smoke run's ` +
    '$0.22-0.25 and $0.14-0.21 (two read-and-cart cases), as logins and forms take more turns'],
}
