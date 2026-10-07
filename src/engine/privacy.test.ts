import { test, expect } from 'claude-code/testing'
import cases from '../../test/parity/fixtures/privacy'
import unicode from '../../test/parity/fixtures/privacy_unicode'
import { isSensitive, normalize, redact } from './privacy'

// Every input jev-skills' privacy.py was captured on (docs/PORTING.md) must give the same
// four answers here: its test corpus, and a Unicode set aimed at where Python's regex and
// JavaScript's differ (digits and word characters beyond ASCII, astral characters, the caps). A mismatch names the case, so a failure points at the rule that drifted.
type Case = { text: string; normalize: string; redact: string; redact_80: string; is_sensitive: boolean }

const all = [...(cases as Case[]), ...(unicode as Case[])]

test('the fixtures are all there', () => {
  expect(all.length).toBe(847 + 43)
})

for (const [name, run] of [
  ['normalize', (c: Case) => [normalize(c.text), c.normalize]],
  ['redact', (c: Case) => [redact(c.text), c.redact]],
  ['redact at 80 characters', (c: Case) => [redact(c.text, 80), c.redact_80]],
  ['isSensitive', (c: Case) => [isSensitive(c.text), c.is_sensitive]],
] as const) {
  test(`${name} matches privacy.py on every fixture`, () => {
    const wrong = all.flatMap((c, i) => {
      const [got, want] = run(c)
      return got === want ? [] : [{ i, text: c.text.slice(0, 120), got, want }]
    })
    expect(wrong).toEqual([])
  })
}
