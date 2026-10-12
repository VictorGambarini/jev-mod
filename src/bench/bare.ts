// A bare jev-mod arm (Arm.bare): the feature under test and nothing else of jev-mod, protective
// features included, so a task bench compares tool against tool (the browser: browse against
// Playwright MCP). A bench overlay cannot do this, by design: it may only make a protective
// feature stricter and gives a risky one none of its settings (core/bench-overlay.ts), so a
// cloned repo that names an overlay can never loosen the person's protections. A bare arm
// instead gets a scratch config folder of its own, as plain Claude Code's does (plain.ts):
//
//   <scratch>/jev-mod/<ID>_OFF        a kill file for every feature but the one under test
//   <scratch>/jev-mod/config.json     the feature's settings for the arm (browser: screenPages false)
//   <scratch>/jev -> <the person's jev config folder>
//
// plain.ts writes it (bareConfig); this file is pure. The arm's Claude calls get
// XDG_CONFIG_HOME=<scratch>. The overlay still turns the feature on (the browser then reaches
// loopback hosts only) and names the ledger.
//
// The decision backend: the mod finds its key as in any session, from the environment (passed
// through), the mod's own key setting (Claude Code's credential store) or the OS secret store,
// none of which XDG_CONFIG_HOME moves, or a file in jev's config folder, which it does
// (<XDG_CONFIG_HOME>/jev/credentials-*, engine/keys.ts). So <scratch>/jev is a link to the
// person's own jev folder: the bench never opens, reads, copies or prints anything in it, and the
// mod reads its key, backends.json, the daily budget and private mode there as it always does.
// Removing the scratch folder removes the link, never what it points to.

import { killFile } from '../core/config'
import { FEATURES, checkKnob, feature } from '../core/registry'
import type { Setting } from './types'

/** An error code for a bare arm whose ledger shows another feature's decisions: it was not bare. */
export const BARE_STRAY = 'other_decisions_in_bare_arm'

/** jev's config folder as the person's own sessions find it (engine/keys.ts configDir), or null without a home. */
export function personJevDir(env: Record<string, string | undefined>): string | null {
  const base = env.XDG_CONFIG_HOME || (env.HOME ? `${env.HOME}/.config` : '')
  return base ? `${base}/jev` : null
}

/** What a bare arm's scratch config folder holds: files by path inside it, and the links to make there. */
export type BareLayout = { files: Record<string, string>; links: Record<string, string> }

/**
 * The scratch config folder for a bare arm of `id`'s feature with `settings`, as paths inside it.
 * Only the feature's own settings are written; a bad one throws, so the arm never runs on a
 * default it did not ask for. `env` is the bench's own, where the person's jev folder is found.
 */
export function bareLayout(id: string, settings: Record<string, Setting>, env: Record<string, string | undefined>): BareLayout {
  const f = feature(id)
  if (!f) throw new Error(`no feature ${id}`)
  const mine: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(settings)) {
    if (!(name in f.knobs)) continue
    const checked = checkKnob(f, name, value)
    if ('problem' in checked) throw new Error(checked.problem)
    mine[name] = checked.value
  }
  const files: Record<string, string> = { 'jev-mod/config.json': JSON.stringify({ features: { [f.id]: mine } }, null, 2) + '\n' }
  for (const other of FEATURES) if (other.id !== f.id) files[killFile('jev-mod', other)] = `bare ${f.id} arm of a bench\n`
  const jev = personJevDir(env)
  return { files, links: jev ? { jev } : {} }
}

/** The features other than `id` that asked the decision model in a row's ledger (`other`: an entry naming none). */
export function strayFeatures(byFeature: Record<string, { requests: number }>, id: string): string[] {
  return Object.entries(byFeature).filter(([name, spend]) => name !== id && spend.requests > 0).map(([name]) => name).sort()
}
