import { test, expect } from 'claude-code/testing'
import { listedOnly, note, repeat, REMEMBERED } from './catalog'

const skill = (name: string, folder = name) => ({ name, description: `${name}.`, path: `/home/u/.claude/skills/${folder}/SKILL.md` })

test('only skills the session lists can be suggested, by name or by folder', () => {
  const found = [skill('deploy'), skill('chart', 'charts'), skill('hidden')]
  expect(listedOnly(found, ['deploy', 'charts', 'other']).map(s => s.name)).toEqual(['deploy', 'chart'])
  expect(listedOnly(found, []).map(s => s.name)).toEqual([])
  expect(listedOnly(found, null).map(s => s.name)).toEqual(['deploy', 'chart', 'hidden'])
})

test('a skill is suggested once a session, and only the last few are remembered', () => {
  const [first, after] = repeat([], 'deploy')
  expect(first).toBe(false)
  expect(repeat(after, 'deploy')[0]).toBe(true)
  let names: string[] = []
  for (let i = 0; i <= REMEMBERED; i++) names = repeat(names, `s${i}`)[1]
  expect(names.length).toBe(REMEMBERED)
  expect(repeat(names, 's0')[0]).toBe(false)
})

test("the note reads as the jev-skills hook wrote it, under the mod's own tag", () => {
  expect(note('deploy', 0.88)).toBe('[jev-mod skill suggestion] The `deploy` skill looks like the right procedure for this request '
    + '(match 0.88). Invoke it with the Skill tool before starting, unless it clearly does not apply.')
})
