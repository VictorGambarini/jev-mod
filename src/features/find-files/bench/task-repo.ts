// find-files' harder task bench: a large real project, where grep alone should leave something to
// win. The small bench (task.ts, tillbox) asks questions in the code's own words on 320 files;
// this one asks them on Saleor, an e-commerce API in Python of about 4,500 files, in words the
// code does not use:
//
//   - paraphrases: the question describes the behaviour with none of its identifiers ("a shopper
//     who is not signed in" for an anonymous checkout, "a prepaid store-credit card" for a gift
//     card, with Saleor's own vouchers as the near-miss);
//   - definitions and callers among near-miss names: functions that share their name with the
//     plugin manager's methods, the webhook plugin's methods and a GraphQL field, with longer names
//     around them (calculate_checkout_total_with_gift_cards, _calculate_checkout_total) and the
//     same words in comments and strings;
//   - questions with no right answer (loyalty points, text messages, a CAPTCHA): the answer is NONE.
//
// The project is cloned at a pinned commit (REPO) once per run, into the run's scratch folder
// (repos/), and hard-linked into each arm's own project folder, so it costs one download of
// about 100 MB and almost no disk per arm. It is never vendored here. The gold was read from the
// code at that commit; `bun src/features/find-files/bench/task-check.ts --repo` checks it against a
// fresh clone: each gold line matches its pattern, and the greps that would find a wrong answer
// find only the gold.

import type { FindTask, Gold } from './task'

/** Saleor (BSD-3-Clause), at its 3.23.0 tag. */
export const REPO = {
  name: 'saleor',
  url: 'https://github.com/saleor/saleor',
  commit: 'e11a5557eff29fbb2eed36e6ff3cd0af08ab9e10',
  tag: '3.23.0',
  license: 'BSD-3-Clause',
}

/**
 * What cloning and linking need from the machine. task-sys.ts installs the real one where the
 * bench runs (src/bench/features.ts imports it); the kit's tests cannot start processes, so they
 * load this file without it.
 */
export type RepoSys = {
  run(cmd: string, args: string[], o: { cwd?: string; timeoutMs: number }): Promise<{ code: number | null; stdout: string; stderr: string }>
  rm(path: string): Promise<void>
  mkdir(path: string): Promise<void>
}
let installed: RepoSys | null = null
export function installRepoSys(sys: RepoSys): void { installed = sys }
const S = (): RepoSys => {
  if (!installed) throw new Error('find-files bench: no RepoSys installed (import bench/task-sys.ts where the bench runs)')
  return installed
}
const run = (cmd: string, args: string[], o: { cwd?: string; timeoutMs: number }) => S().run(cmd, args, o)

/** The clone's folder name, under a run's repos/ folder. */
export const cloneName = () => `${REPO.name}-${REPO.commit.slice(0, 12)}`

const git = (cwd: string, ...args: string[]) => run('git', ['-c', 'advice.detachedHead=false', ...args], { cwd, timeoutMs: 600_000 })

/** Whether `at` holds the pinned commit, checked out and unchanged. */
async function intact(at: string): Promise<boolean> {
  const head = await git(at, 'rev-parse', 'HEAD').catch(() => null)
  if (!head || head.code !== 0 || head.stdout.trim() !== REPO.commit) return false
  const status = await git(at, 'status', '--porcelain')
  return status.code === 0 && status.stdout.trim() === ''
}

/**
 * The pinned commit cloned into `dir` (shallow: that one commit), or the clone already there when
 * it is intact. A clone that changed (an arm wrote through a hard link) is cloned again.
 */
export async function cloneRepo(dir: string): Promise<string> {
  const at = `${dir}/${cloneName()}`
  if (await intact(at)) return at
  await S().rm(at)
  await S().mkdir(at)
  for (const args of [['init', '-q'], ['remote', 'add', 'origin', REPO.url], ['fetch', '-q', '--depth', '1', 'origin', REPO.commit], ['checkout', '-q', 'FETCH_HEAD']]) {
    const r = await git(at, ...args)
    if (r.code !== 0) throw new Error(`git ${args[0]} of ${REPO.name} failed: ${r.stderr.trim().slice(0, 160)}`)
  }
  if (!(await intact(at))) throw new Error(`${REPO.name} is not at ${REPO.commit} after the clone`)
  return at
}

/** The folder three levels up: a run's scratch folder from an arm's project (<run>/<case>/arm-<tag>/project). */
export function runFolderOf(workdir: string): string {
  return workdir.replace(/\/+$/, '').split('/').slice(0, -3).join('/') || '/'
}

/** A case's `prepare`: the run's clone, hard-linked into the arm's empty project folder. */
export async function prepareRepo(workdir: string): Promise<void> {
  const clone = await cloneRepo(`${runFolderOf(workdir)}/repos`)
  const r = await run('cp', ['-al', `${clone}/.`, workdir], { timeoutMs: 600_000 })
  if (r.code !== 0) throw new Error(`linking the ${REPO.name} clone failed: ${r.stderr.trim().slice(0, 160)}`)
}

const at = (path: string, line: number, needle: RegExp): Gold => ({ path, line, needle })
const file = (path: string): Gold => ({ path })
const DEFINED = 'the line where it is defined'

/** What each case tests, for the README and the report. */
export const WHAT: Record<string, string> = {
  'saleor-guest-cart-expiry': 'paraphrase: "a shopper who is not signed in" for anonymous checkouts; the user and empty-cart periods 3 and 6 lines below are near-misses',
  'saleor-webhook-proof': 'paraphrase: "a proof that the request comes from the shop" for the payload signature; the Stripe and JWT signature code are near-misses',
  'saleor-stock-hold': 'paraphrase: "held back from other shoppers" for stock reservations; the reservation-expiry task is a near-miss',
  'saleor-giftcard-expiry': 'paraphrase: "a prepaid store-credit card" for a gift card; vouchers (discount codes) and is_gift_card_expired are near-misses',
  'saleor-unpaid-orders': 'paraphrase: "marked as lapsed" for expired orders; the Celery task that calls it and delete_expired_orders_task are near-misses',
  'saleor-failing-app-share': 'paraphrase: the circuit breaker\'s failure percentage, not named; its recovery twin 6 lines below is the near-miss',
  'saleor-picture-resize': 'paraphrase, two files: the thumbnail view and the image processing, not models, signals or the GraphQL side',
  'saleor-refund-callers': 'callers among homonyms: order_refunded is also a plugin-manager method, a webhook-plugin method, a GraphQL field and a string',
  'saleor-checkout-total-callers': 'callers among near names: not ..._with_gift_cards, not _calculate_checkout_total, not manager.calculate_checkout_total',
  'saleor-order-created-def': 'which of five order_created definitions checkout completion calls (follow the import)',
  'saleor-none-loyalty': 'no right answer: loyalty points do not exist (only a tax-code description in a test cassette mentions them)',
  'saleor-none-sms': 'no right answer: no text messages are sent; e-mail notifications are the near-miss',
  'saleor-none-captcha': 'no right answer: no CAPTCHA anywhere; account creation and its throttling are near-misses',
}

/** The cases, with the tools a read-only search may use (task.ts's, so both suites allow the same). */
export function repoTasks(allowedTools: string[]): FindTask[] {
  const base = { setup: [], allowedTools, git: false, suite: 'repo' as const, prepare: prepareRepo }
  return [
    { ...base, id: 'saleor-guest-cart-expiry', format: 'lines', lineIs: 'the line that sets the period',
      ask: 'A shopper who is not signed in puts things in a cart and never comes back. After how long is that cart thrown away by default? Give the line where that default period is set, not where it is used.',
      gold: [at('saleor/settings.py', 605, /^ANONYMOUS_CHECKOUTS_TIMEDELTA = /)] },
    { ...base, id: 'saleor-webhook-proof', format: 'lines', lineIs: DEFINED,
      ask: 'When the shop posts an event to an app\'s address, it attaches a proof that the request really comes from the shop: a keyed hash when the app has a shared secret, a detached token otherwise. Which function makes that proof? Give the line where it is defined.',
      gold: [at('saleor/webhook/transport/__init__.py', 7, /^def signature_for_payload\(/)] },
    { ...base, id: 'saleor-stock-hold', format: 'lines', lineIs: DEFINED,
      ask: 'Items a shopper puts in a cart can be held back from other shoppers for a while. Which function says how many minutes that hold lasts for a given shopper, signed in or not? Give the line where it is defined.',
      gold: [at('saleor/warehouse/reservations.py', 408, /^def get_reservation_length\(/)] },
    { ...base, id: 'saleor-giftcard-expiry', format: 'lines', lineIs: DEFINED,
      ask: 'When a prepaid store-credit card is issued, what works out from the shop\'s settings the last day it can be spent? Give the line where that function is defined.',
      gold: [at('saleor/giftcard/utils.py', 219, /^def calculate_expiry_date\(/)] },
    { ...base, id: 'saleor-unpaid-orders', format: 'lines', lineIs: DEFINED,
      ask: 'Orders that were placed but never paid are marked as lapsed after a number of minutes set per sales channel. Which function picks those orders out and changes their status? Give the line where it is defined.',
      gold: [at('saleor/order/tasks.py', 143, /^def _expire_orders\(/)] },
    { ...base, id: 'saleor-failing-app-share', format: 'lines', lineIs: 'the line that sets it',
      ask: 'The shop stops calling an app\'s synchronous endpoints for a while once too large a share of its recent calls have failed. Where is that share, as a percentage, set for an app that is working normally (not one that is recovering)? Give the line that sets it.',
      gold: [at('saleor/webhook/circuit_breaker/breaker_board.py', 35, /^BREAKER_BOARD_FAILURE_THRESHOLD_PERCENTAGE: int = 35/)] },
    { ...base, id: 'saleor-picture-resize', format: 'paths',
      ask: 'A product picture can be asked for at a smaller width, and the shop makes and stores that smaller copy. Which two files do it: the request handler that serves it, and the code that actually scales the image?',
      gold: [file('saleor/thumbnail/views.py'), file('saleor/thumbnail/utils.py')] },
    { ...base, id: 'saleor-refund-callers', format: 'lines', lineIs: 'the line of the call',
      ask: 'What calls order_refunded, the function in saleor/order/actions.py? I want its call sites outside tests: not its definition, not imports, and not the plugin manager\'s or the plugins\' methods of the same name or references to them.',
      gold: [at('saleor/order/actions.py', 753, /^\s+order_refunded\($/), at('saleor/order/actions.py', 1994, /^\s+order_refunded\($/),
        at('saleor/payment/gateways/stripe/webhooks.py', 552, /^\s+order_refunded\($/), at('saleor/graphql/order/mutations/order_refund.py', 105, /^\s+order_refunded\($/),
        at('saleor/graphql/payment/mutations/payment/payment_refund.py', 61, /^\s+order_refunded\($/)] },
    { ...base, id: 'saleor-checkout-total-callers', format: 'lines', lineIs: 'the line of the call',
      ask: 'What calls calculate_checkout_total, the function in saleor/checkout/calculations.py? Call sites outside tests only: not calculate_checkout_total_with_gift_cards, not _calculate_checkout_total, and not calls of the plugin manager\'s method of the same name.',
      gold: [at('saleor/checkout/calculations.py', 143, /= calculate_checkout_total\($/), at('saleor/checkout/complete_checkout.py', 750, /= calculations\.calculate_checkout_total\($/),
        at('saleor/checkout/complete_checkout.py', 1533, /= calculations\.calculate_checkout_total\($/)] },
    { ...base, id: 'saleor-order-created-def', format: 'lines', lineIs: DEFINED,
      ask: 'Several things in this project are named order_created. Which one does checkout completion call once the order exists? Give the line where that one is defined.',
      gold: [at('saleor/order/actions.py', 286, /^def order_created\($/)] },
    { ...base, id: 'saleor-none-loyalty', format: 'paths',
      ask: 'Where are the loyalty points a customer earns on an order worked out and added to their balance?', gold: [] },
    { ...base, id: 'saleor-none-sms', format: 'paths',
      ask: 'Which code sends a customer a text message (SMS) on their phone when their order ships?', gold: [] },
    { ...base, id: 'saleor-none-captcha', format: 'paths',
      ask: 'Where does the shop check a CAPTCHA before it lets someone create an account?', gold: [] },
  ]
}
