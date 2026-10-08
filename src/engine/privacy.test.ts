import { test, expect } from 'claude-code/testing'
import cases from '../../test/parity/fixtures/privacy'
import unicode from '../../test/parity/fixtures/privacy_unicode'
import { DIVERGENCES } from '../../test/parity/divergences'
import { foldConfusables, isSensitive, normalize, redact } from './privacy'

// Every input jev-skills' privacy.py was captured on (docs/PORTING.md) must give the same
// four answers here: its test corpus, and a Unicode set aimed at where Python's regex and
// JavaScript's differ (digits and word characters beyond ASCII, astral characters, the caps).
// The exceptions are leaks fixed in the port, listed with their reasons in divergences.ts. A mismatch names the case, so a failure points at the rule that drifted.
type Case = { text: string; normalize: string; redact: string; redact_80: string; is_sensitive: boolean }

const captured = [...(cases as Case[]), ...(unicode as Case[])]
const all = captured.map(c => ({ ...c, ...(DIVERGENCES[c.text] ?? {}) }))

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

test('every divergence is a captured input whose Python answer really differs', () => {
  const stale = Object.keys(DIVERGENCES).filter(text => {
    const python = captured.find(c => c.text === text)
    if (!python) return true
    const { why: _, ...fields } = DIVERGENCES[text]!
    return Object.entries(fields).every(([k, v]) => (python as any)[k] === v)
  })
  expect(stale).toEqual([])
})

// The fixed leaks, on inputs beyond the fixtures.
test('a secret glued to an accented word is still masked and refused', () => {
  expect(redact('ñsecret_key here')).toBe('ñsecret_key here')
  expect(isSensitive('ñsecret_key here')).toBe(true)
  expect(redact('passé AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI')).toBe('passé AWS_SECRET_ACCESS_KEY=[secret]')
  expect(redact('útoken sk-abcdefghijklmnop1234')).toBe('útoken [secret]')
})

test('emails with letters beyond ASCII are masked', () => {
  expect(redact('write to björn.ångström@uni.se')).toBe('write to [email]')
  expect(redact('名前 taro.山田@example.jp')).toBe('名前 [email]')
})

test('a card in another script is masked when it passes Luhn, kept when it does not', () => {
  expect(redact('card ४१११ ११११ ११११ ११११')).toBe('card [card]')
  expect(redact('order ४१११ ४१११ ४१११ ४१११')).toBe('order ४१११ ४१११ ४१११ ४१११')
})

test('look-alike disguises fold to Latin; ordinary Russian and Greek text does not', () => {
  expect(isSensitive('АPI_KEY=hunter2')).toBe(true)
  expect(redact('АPI_KEY=hunter2')).toBe('API_KEY=[secret]')
  expect(isSensitive('раѕѕwоrd')).toBe(true)
  expect(isSensitive('АРІ_КЕҮ=hunter2')).toBe(true)
  expect(foldConfusables('сор ехо Мах')).toBe('сор ехо Мах')
  const russian = 'Пароль для входа: отправьте отчёт до пятницы, спасибо.'
  const greek = 'Καλημέρα, ο κωδικός του έργου είναι έτοιμος.'
  expect(foldConfusables(russian)).toBe(russian)
  expect(foldConfusables(greek)).toBe(greek)
  expect(redact(russian)).toBe(russian)
  expect(isSensitive(greek)).toBe(false)
})
