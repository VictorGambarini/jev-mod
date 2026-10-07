import type { IO } from '../../core/io'
import { jev } from '../../core/jev'
import * as memory from '../../core/memory'

// Skills: at submit, the one installed skill the prompt needs, if any, as context beside it.
// Jev ranks the whole catalog and may say no skill is needed; a skill already suggested in
// the session is not suggested again.

const SKILL_TIMEOUT_MS = 10_000
export type SkillsSpace = { skill?: string }

/** The suggestion to add beside the prompt, or null. */
export async function analyse(io: IO, text: string): Promise<string | null> {
  const event = { prompt: text, session_id: memory.session() ?? '', via: 'mod' }
  const out = await jev(io, ['hook', 'user-prompt'], JSON.stringify(event), SKILL_TIMEOUT_MS)
  const note = out?.hookSpecificOutput?.additionalContext
  const suggestion = typeof note === 'string' && note.trim() ? note : null
  const named = suggestion ? /`([^`]+)`/.exec(suggestion) : null
  memory.space<SkillsSpace>('skills').skill = named ? named[1] : undefined
  if (suggestion) io.toast(suggestion.replace(/^\[Jev skill suggestion\] /, 'jev: ').slice(0, 120))
  return suggestion
}
