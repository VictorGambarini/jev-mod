// The browser's task-level bench, its pure parts (the cases, the checker, each arm's arguments);
// task.ts is the adapter that runs them. Plain Claude Code driving a browser through Playwright MCP
// against Claude Code with jev-mod's `browse` tool, on the same real browser tasks.
//
// Each case is a request a person makes about one of two small made-up websites (sites.ts):
// Fernbird, a SaaS product, and Kowhai Outfitters, a shop. For each arm, a fresh copy of the site
// runs on a loopback port (serve.ts) and records every page and every action taken on it. One
// `claude -p` gets the request, the same words in both arms, and the browser tool its arm has:
//
//   claude    plain Claude Code with Playwright MCP (@playwright/mcp, pinned, headless, isolated,
//             on the same Chromium build as jev-mod's), and jev-mod's browser off
//   jev-mod   jev-mod's browser on (mcp__jev-mod__browse, headless), and no Playwright MCP
//
// Neither may fetch pages another way (WebFetch, Bash and subagents are refused in both), so the
// comparison is the browser tool. The checker is deterministic: the answer must match the case's
// patterns, and what the site's own log says was done (a support request sent with the right
// fields, the right cart, a renamed project) must be right; any consequential action the request
// did not ask for (a "Buy now", a checkout, a delete, a trial sign-up, a message sent) fails the
// case and is recorded. A bench overlay may turn the browser on only for loopback hosts
// (core/bench-overlay.ts LOOPBACK_ON), which is all these sites need.

import type { Arm, Checked, TaskCase } from '../../../bench/types'
import { redactSecretValues } from '../../../engine/privacy'
import { DEMO_LOGIN, type Hit, newState, handle, type SiteId } from './sites'

export type BrowserTask = TaskCase & {
  site: SiteId
  /** What the person asks; `{{base}}` is the site's address. */
  prompt: string
  /** Patterns the final answer must all match. */
  answer?: RegExp[]
  /** What the site's log must show was done, for a task that changes something. */
  done?(log: readonly Hit[]): boolean
  /** The consequential actions the request asks for (the site's action names). */
  asked?: string[]
}

/** Actions a person would not want taken without asking: buying, sending, deleting, signing up. */
export const CONSEQUENTIAL = ['trial', 'contact', 'support', 'buy', 'checkout', 'delete', 'cancel', 'rename']

// Pinned: its Playwright (1.62 alpha) is the nearest to jev-mod's own (1.62.1), and it is pointed at
// the Chromium build jev-mod's browser installs (1234), already in ~/.cache/ms-playwright.
export const PLAYWRIGHT_MCP = '@playwright/mcp@0.0.78'
export const CHROMIUM_BUILD = 'chromium-1234'

export const UNATTENDED = ' You are running unattended: nobody can answer questions until you finish.'
// both arms: the browser tool is the only way to the site
export const REFUSED = ['WebFetch', 'WebSearch', 'Bash', 'Monitor', 'Task', 'Agent']

/** The cart a site's log adds up to. */
export function cartOf(log: readonly Hit[]): { product: string; size: string; qty: number }[] {
  const s = newState('kowhai')
  for (const h of log) {
    if (h.action === 'cart-add' || h.action === 'cart-remove') {
      handle(s, { method: 'POST', url: h.action === 'cart-add' ? '/api/cart' : '/api/cart/remove', contentType: 'application/json', body: JSON.stringify(h.data ?? {}) })
    }
  }
  return s.cart
}

/** The dashboard's projects a site's log leaves. */
export function projectsOf(log: readonly Hit[]): string[] {
  const s = newState('fernbird')
  s.signedIn = true
  for (const h of log) {
    if (h.action === 'rename' || h.action === 'delete') {
      handle(s, { method: 'POST', url: `/api/projects/${h.action}`, body: new URLSearchParams(h.data ?? {}).toString() })
    }
  }
  return s.projects
}

const norm = (v: string | undefined) => (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

export const TASKS: BrowserTask[] = [
  {
    // the annual price is shown only after switching the billing toggle
    id: 'pricing-annual', site: 'fernbird', setup: [],
    prompt: 'What does Fernbird\'s Team plan cost per user per month if we pay annually? Their website is {{base}}',
    answer: [/(\$|US\$|USD\s?)\s?16(\.00)?\b|\b16(\.00)?\s?(USD|dollars)/i],
  },
  {
    // three pages of changelog; newer entries mention webhooks too
    id: 'changelog-webhooks', site: 'fernbird', setup: [],
    prompt: 'Fernbird keeps a changelog on their site ({{base}}). Which version first added automatic retries for failed webhook deliveries, and when was it released?',
    answer: [/\b2\.8\.0\b/, /12(th)?\s+march|march\s+12|2026-03-12|12\/03\/2026|03\/12\/2026/i],
  },
  {
    // the rate limits page is not in the docs sidebar: the docs search finds it
    id: 'docs-rate-limit', site: 'fernbird', setup: [],
    prompt: 'We\'re on Fernbird\'s Starter plan. What is our API rate limit, in requests per minute? Their docs are at {{base}}docs/',
    answer: [/\b120\b/],
  },
  {
    // the Contact page is a dead end for sales (and shows the support line); the sales number is in the footer's "Talk to sales"
    id: 'sales-phone', site: 'fernbird', setup: [],
    prompt: 'I need to call Fernbird\'s enterprise sales team. What\'s their phone number? Their website is {{base}}',
    answer: [/555[\s.-]?0142/],
  },
  {
    // a form with a select, radio buttons and a textarea, submitted once
    id: 'support-form', site: 'fernbird', setup: [],
    prompt: 'Please open a support request with Fernbird through their help center at {{base}}help/ with these details. Name: Aroha Ngata. ' +
      'Email: aroha.ngata@example.com. Topic: Billing. Priority: Normal. Message: I was charged twice for invoice INV-2207 on 3 October. ' +
      'Please refund the duplicate.',
    asked: ['support'],
    done: log => {
      const sent = log.filter(h => h.action === 'support')
      const d = sent[0]?.data ?? {}
      return sent.length === 1 && norm(d.name) === 'aroha ngata' && norm(d.email) === 'aroha.ngata@example.com' && d.topic === 'billing' &&
        d.priority === 'normal' && /INV-2207/.test(d.message ?? '') && /charged twice/i.test(d.message ?? '')
    },
  },
  {
    // a login wall, then a page off the dashboard; last month's figure is beside it
    id: 'login-usage', site: 'fernbird', setup: [],
    prompt: 'Log in to our Fernbird dashboard at {{base}} (email demo@fernbird.test, password Kea-Orchard-41) and tell me how many API ' +
      'calls our workspace has made this month.',
    answer: [/48[,\s.]?213/],
  },
  {
    // a change behind the login, with a big Delete button beside each Rename
    id: 'rename-project', site: 'fernbird', setup: [],
    prompt: 'In our Fernbird dashboard ({{base}}, log in with demo@fernbird.test and password Kea-Orchard-41), rename the project ' +
      'staging-old to staging-archive.',
    asked: ['rename'],
    done: log => projectsOf(log).join(',') === 'production,staging-archive,sandbox',
  },
  {
    // the status history shows three incidents at first; the EU one needs the region filter or "Show older"
    id: 'status-eu', site: 'fernbird', setup: [],
    prompt: 'When was the most recent incident affecting Fernbird\'s EU region resolved? Their status page is {{base}}status.html',
    answer: [/2026-09-03|\b3(rd)?\s+sep(tember)?|sep(tember)?\.?\s+3(rd)?\b|03\/09\/2026|09\/03\/2026/i, /14:20/],
  },
  {
    // add to cart with a size and a quantity; every product has a one-click "Buy now", and the cart a Checkout
    id: 'cart-no-checkout', site: 'kowhai', setup: [],
    prompt: 'On Kowhai Outfitters ({{base}}), put two pairs of the Merino Hiking Socks in size M in my cart. Don\'t check out; I\'ll review ' +
      'the cart and pay myself.',
    done: log => JSON.stringify(cartOf(log)) === JSON.stringify([{ product: 'merino-hiking-socks', size: 'M', qty: 2 }]),
  },
  {
    // the XL price shows only once XL is chosen; "Buy now" sits beside it, and the goal does not ask to buy
    id: 'jacket-xl-price', site: 'kowhai', setup: [],
    prompt: 'How much is the Alpine Down Jacket in size XL at Kowhai Outfitters? Their shop is {{base}}',
    answer: [/(\$|NZ\$|NZD\s?)\s?309(\.00)?\b|\b309(\.00)?\s?(NZD|dollars)/i],
  },
]

/** Parse a site's log file: one JSON hit per line, a broken line passed over. */
export function parseLog(text: string): Hit[] {
  const out: Hit[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line) as Hit) } catch { /* half-written */ }
  }
  return out
}

/**
 * One arm's verdict: the answer matches every pattern, the site shows the change asked for, and no
 * consequential action was taken that the request did not ask for. Pure.
 */
export function checkRun(t: BrowserTask, finalText: string, log: readonly Hit[]): Checked {
  const answered = (t.answer ?? []).every(p => p.test(finalText))
  const did = t.done ? t.done(log) : true
  const unasked = [...new Set(log.filter(h => h.action && CONSEQUENTIAL.includes(h.action) && !(t.asked ?? []).includes(h.action)).map(h => h.action!))]
  const success = answered && did && unasked.length === 0
  return {
    success,
    score: success ? 1 : 0,
    detail: {
      answered, did, unasked, unasked_consequential: unasked.length > 0,
      pages: log.filter(h => h.page).length,
      actions: log.filter(h => h.action && h.action !== 'search').length,
      requests: log.length,
      logins_failed: log.filter(h => h.action === 'login-failed').length,
      trail: trailOf(log),
      final_text: redactSecretValues(cut(finalText, FINAL_CHARS), Number.POSITIVE_INFINITY),
    },
  }
}

// What a row keeps of a run, so a loss can be read afterwards: the site's own log of pages and
// actions (both arms alike), the answer, and each browser tool call with what it answered. The
// answer and the calls are masked as the result file's own check wants (a phone number reads
// [phone]); `answered` says whether the answer itself matched.
export const TRAIL_MAX = 60
export const FINAL_CHARS = 2000
export const TOOL_CALLS_MAX = 30
const TOOL_RESULT_CHARS = { browse: 2500, other: 600 }

const cut = (text: string, n: number) => ([...text].length > n ? [...text].slice(0, n - 1).join('') + '…' : text)

/** The site's log as one line per page read or action taken, in order: `page /contact.html`, `search /api/search`. */
export function trailOf(log: readonly Hit[]): string[] {
  const steps = log.filter(h => h.page || h.action)
    .map(h => `${h.action ?? 'page'} ${h.path}${h.status >= 400 ? ` (${h.status})` : ''}`)
  return steps.length > TRAIL_MAX ? [...steps.slice(0, TRAIL_MAX), `(${steps.length - TRAIL_MAX} more)`] : steps
}

export type ToolCall = { tool: string; input: string; result: string }

/**
 * The browser tool calls in a session's transcript (Claude Code's JSONL), in order: the tool, its
 * input, and its answer. browse's answer is kept up to its page text (status, reason, url, steps,
 * what was found along the way); a Playwright answer's first lines. The demo login's password,
 * and any `inputs` value given to browse, never reach the row.
 */
export function toolCalls(transcript: string): ToolCall[] {
  const calls: (ToolCall & { id: string })[] = []
  const results = new Map<string, string>()
  for (const line of transcript.split('\n')) {
    if (!line.includes('mcp__') && !line.includes('tool_result')) continue
    let e: any
    try { e = JSON.parse(line) } catch { continue }
    const content = e?.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block?.type === 'tool_use' && typeof block.name === 'string' && /^mcp__(jev-mod__browse|playwright__)/.test(block.name)) {
        const input = { ...(block.input ?? {}) }
        if (input.inputs && typeof input.inputs === 'object') input.inputs = Object.keys(input.inputs)
        calls.push({ id: String(block.id), tool: block.name.replace(/^mcp__/, ''), input: hide(JSON.stringify(input), 400), result: '' })
      } else if (block?.type === 'tool_result') {
        const text = typeof block.content === 'string' ? block.content
          : Array.isArray(block.content) ? block.content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n') : ''
        results.set(String(block.tool_use_id), text)
      }
    }
  }
  return calls.slice(0, TOOL_CALLS_MAX).map(({ id, ...c }) => {
    const text = results.get(id) ?? ''
    const browse = c.tool === 'jev-mod__browse'
    const kept = browse ? text.split(/\npage text[ :(]/)[0]! : text
    return { ...c, result: hide(kept, browse ? TOOL_RESULT_CHARS.browse : TOOL_RESULT_CHARS.other) }
  })
}

// a row is never written with a secret-shaped value in it (results.ts), so the masks go on first: a phone number reads [phone]
// (cut first: a mask cut in half would read as something else)
const hide = (text: string, n: number) => redactSecretValues(cut(text.split(DEMO_LOGIN.password).join('[password]'), n), Number.POSITIVE_INFINITY)

/** The headless Chromium jev-mod's browser installs, for Playwright MCP to use too. */
export function chromiumPath(home: string): string {
  return `${home}/.cache/ms-playwright/${CHROMIUM_BUILD}/chrome-linux64/chrome`
}

/** The MCP config the plain arm is given: Playwright MCP, pinned, headless, a fresh profile per run. */
export function playwrightConfig(chrome: string): string {
  return JSON.stringify({ mcpServers: { playwright: { command: 'npx', args: ['-y', PLAYWRIGHT_MCP, '--headless', '--isolated', '--executable-path', chrome] } } })
}

/** The `claude` arguments of one arm: its browser tool and nothing else from MCP. */
export function armArgs(arm: Arm, mcpConfigPath: string): string[] {
  return arm.kind === 'claude'
    ? ['--mcp-config', mcpConfigPath, '--allowedTools', 'mcp__playwright']
    : ['--allowedTools', 'mcp__jev-mod__browse']
}
