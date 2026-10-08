import type { Skill } from '../../engine/skills'

// Which of the skills found on disk may be suggested, and whether one already was.

/**
 * The skills found that the session also lists for the model: a skill Claude Code does not
 * list (disabled, or not a skill it reads) is never suggested. A skill matches by its name or
 * by its folder's, since the listing may use either. When the session cannot say what it
 * lists, everything found stands.
 */
export function listedOnly(found: Skill[], listed: string[] | null): Skill[] {
  if (listed === null) return found
  const names = new Set(listed)
  return found.filter(skill => names.has(skill.name) || names.has(folderOf(skill.path)))
}

function folderOf(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 2] ?? ''
}

export const REMEMBERED = 20

/** Record `name` as suggested; true when it was suggested in this session before. */
export function repeat(suggested: string[], name: string): [boolean, string[]] {
  if (suggested.includes(name)) return [true, suggested]
  return [false, [...suggested, name].slice(-REMEMBERED)]
}

export function note(name: string, match: number): string {
  return `[jev-mod skill suggestion] The \`${name}\` skill looks like the right procedure for this request (match ${match}). `
    + 'Invoke it with the Skill tool before starting, unless it clearly does not apply.'
}
