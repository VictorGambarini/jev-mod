import { test, expect } from 'claude-code/testing'
import cases from '../../test/parity/fixtures/privacy'
import unicode from '../../test/parity/fixtures/privacy_unicode'
import { DIVERGENCES } from '../../test/parity/divergences'
import { foldConfusables, isSensitive, maskSecretValues, normalize, redact, redactSecretValues } from './privacy'

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

// Phone redaction left identifiers whole, and still masks phones (divergence from privacy.py).
test('digits inside a DOI, an ISBN or a URL are not a phone', () => {
  expect(redact('see 10.1186/s13568-017-0448-4 for the method')).toBe('see 10.1186/s13568-017-0448-4 for the method')
  expect(redact('https://doi.org/10.1007/s00253-017-8505-5')).toBe('https://doi.org/10.1007/s00253-017-8505-5')
  expect(redact('doi:10.1000/8505550134')).toBe('doi:10.1000/8505550134')
  expect(redact('ISBN 9780306406157 and 978-0-306-40615-7')).toBe('ISBN 9780306406157 and 978-0-306-40615-7')
  expect(redact('https://v2.plasticdb.org/records/8505550134/view')).toBe('https://v2.plasticdb.org/records/8505550134/view')
  expect(redact('PMID 28585118, accession MN-415-555-0134-2')).toBe('PMID 28585118, accession MN-415-555-0134-2')
})

test('real phone numbers are still masked', () => {
  expect(redact('call +64 21 123 4567 today')).toBe('call [phone] today')
  expect(redact('office (09) 373 7599 ext')).toBe('office [phone] ext')
  expect(redact('or 555-123-4567.')).toBe('or [phone].')
  expect(redact('ring 021 123 4567')).toBe('ring [phone]')
  expect(redact('x8505550134 and Tel:8505550134')).toBe('x[phone] and Tel:[phone]')
  expect(redact('18505550134')).toBe('[phone]')
})

test('maskSecretValues masks the value a secret name is given, keeps the name and mere mentions', () => {
  const cases: [string, string][] = [
    ['const password = "hunter2"', 'const password = "[secret]"'],
    ["apiKey: 'abc123xyz'", "apiKey: '[secret]'"],
    ['{"password": "hunter2", "user": "bob"}', '{"password": "[secret]", "user": "bob"}'],
    ['password: hunter2', 'password: [secret]'],
    ['Authorization: Basic dXNlcjpwYXNzd29yZA==', 'Authorization: Basic [secret]'],
    ['curl --password hunter2 -H x', 'curl --password [secret] -H x'],
    ['The staging password is hunter22, never print it.', 'The staging password is [secret], never print it.'],
    ['раssword = "hunter2"', 'password = "[secret]"'],
    ['-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----', '[private key]'],
  ]
  for (const [input, out] of cases) expect(maskSecretValues(input)).toBe(out)
  for (const kept of ['Never log API keys or passwords.', 'apiKey: config.apiKey', 'apiKey: string', 'if (password === input) {',
    'const apiKey = process.env.API_KEY', 'password = getPassword()', 'fetch(url, { apiKey })', 'author: "Victor"']) {
    expect(maskSecretValues(kept)).toBe(kept)
  }
})

test('redactSecretValues leaves no value isSensitive would catch, only the names', () => {
  const text = 'DB_PASSWORD=hunter2\nconst t = "sk-abcdefghijklmnopqrstuv"\nheaders = { Authorization: `Bearer abcdefgh12345678` }'
  const out = redactSecretValues(text)
  for (const value of ['hunter2', 'sk-abcdefghijklmnopqrstuv', 'abcdefgh12345678']) expect(out.includes(value)).toBe(false)
  expect(out).toContain('DB_PASSWORD=[secret]')
})

test('a dotted value is masked unless it reads as a reference; user:pass after -u and in a URL is masked', () => {
  const masked: [string, string][] = [
    ['password=correct.horse', 'password=[secret]'],
    ['secret: prod.Xk9pLm2Q', 'secret: [secret]'],
    ['token: abc.defGhi', 'token: [secret]'],
    ['curl -u admin:hunter2 https://x', 'curl -u admin:[secret] https://x'],
    ['curl --user=admin:hunter2 x', 'curl --user=admin:[secret] x'],
    ['postgres://admin:hunter2@db:5432/x', 'postgres://admin:[secret]@db:5432/x'],
  ]
  for (const [input, out] of masked) {
    expect(maskSecretValues(input)).toBe(out)
    expect(redactSecretValues(input)).toBe(out)
  }
  for (const kept of ['apiKey: config.apiKey', 'password: opts.password', 'const apiKey = process.env.X',
    'key: settings.DB_PASSWORD', 'password = getPassword()']) {
    expect(redactSecretValues(kept)).toBe(kept)
  }
})
