import { hostOf } from '../../core/host'
import type { IO } from '../../core/io'
import { coolingOff, recordCalls } from '../../core/jev'
import * as memory from '../../core/memory'
import { isPrivate, jevDir, mode } from '../../core/settings'
import { discover, pick, type Skill } from '../../engine/skills'
import { listedOnly, note, repeat } from './catalog'

// Skills: at submit, the one installed skill the prompt needs, if any, as context beside it.
// Jev ranks the whole catalog and may say no skill is needed; a skill already suggested in
// the session is not suggested again. The same switch as jev-skills' hook (`hook_skills`):
// "shadow" asks and records but suggests nothing.

// `catalog`: how many skills the last pick ranked; `listed`: whether the session's own listing narrowed them.
export type SkillsSpace = { suggested?: string[]; catalog?: number; listed?: boolean }

const CATALOG_TTL_MS = 5 * 60_000
let cached: { key: string; at: number; skills: Skill[]; listed: boolean } | null = null

/**
 * The skills Claude Code reads (the project's own folder first, then the user's), less any the
 * session does not list. Read again after five minutes, so a skill added meanwhile is seen.
 */
async function catalog(io: IO): Promise<{ skills: Skill[]; listed: boolean }> {
  const [root, home] = await Promise.all([io.projectRoot(), io.home()])
  const roots = [root ? `${root}/.claude/skills` : null, home ? `${home}/.claude/skills` : null]
    .filter((r): r is string => r !== null)
  const unique = [...new Set(roots)] // a session started in the home folder names one root twice
  const key = unique.join('\u0000')
  if (cached && cached.key === key && Date.now() - cached.at < CATALOG_TTL_MS) return cached
  const files = {
    folders: (path: string) => io.folders(path),
    read: async (path: string) => { try { return await io.readFile(path) } catch { return undefined } },
  }
  const [found, listed] = await Promise.all([discover(files, unique), io.skillNames()])
  cached = { key, at: Date.now(), skills: listedOnly(found, listed), listed: listed !== null }
  return cached
}

/** The suggestion to add beside the prompt, or null. */
export async function analyse(io: IO, text: string): Promise<string | null> {
  if (coolingOff()) return null
  const dir = await jevDir(io)
  const setting = await mode(io, dir, 'hook_skills')
  if (setting === 'off' || await isPrivate(io, dir)) return null
  const { skills, listed } = await catalog(io)
  const picked = await pick(hostOf(io), text, skills, { topK: 1 })
  const mine = memory.space<SkillsSpace>('skills')
  mine.catalog = skills.length
  mine.listed = listed
  await recordCalls(io, picked.calls ?? [], picked.errors ?? [])
  await memory.save(io)
  const chosen = picked.skills[0]
  if (!chosen || setting !== 'on') return null
  const [again, suggested] = repeat(mine.suggested ?? [], chosen.name)
  if (again) return null
  mine.suggested = suggested
  await memory.save(io)
  io.toast(`jev: try the ${chosen.name} skill`.slice(0, 120))
  return note(chosen.name, chosen.match)
}
