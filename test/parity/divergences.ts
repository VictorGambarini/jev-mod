// Where engine/privacy.ts deliberately answers differently from jev-skills' privacy.py. The
// fixtures keep Python's answers as captured; the parity test uses these instead for the
// listed inputs, and fails if one of them no longer differs (a stale entry hides nothing).
//
// Each entry is a leak the Unicode fixtures exposed in privacy.py, fixed in the port only.

type Fields = { redact?: string; redact_80?: string; is_sensitive?: boolean }
export type Divergence = Fields & { why: string }

const ACCENT_BOUNDARY = 'an accented letter in front hid the secret from \\b (Unicode word boundary)'
const UNICODE_EMAIL = 'the email pattern only allowed ASCII letters, so the address went out whole'

export const DIVERGENCES: Record<string, Divergence> = {
  'card ٤١١١ ١١١١ ١١١١ ١١١١': { redact: 'card [card]', redact_80: 'card [card]',
    why: 'Luhn read Arabic-Indic digits as code point - 48, so a real card never passed' },
  'éjohn@example.com': { redact: '[email]', redact_80: '[email]', why: UNICODE_EMAIL },
  'josé@example.com': { redact: '[email]', redact_80: '[email]', why: UNICODE_EMAIL },
  'mail to Zoë.Smith@exämple.com or zoe@example.com': {
    redact: 'mail to [email] or [email]', redact_80: 'mail to [email] or [email]', why: UNICODE_EMAIL },
  'éAKIA1234567890ABCDEF': { redact: 'é[secret]', redact_80: 'é[secret]', is_sensitive: true, why: ACCENT_BOUNDARY },
  'naïveSECRET_KEY=abc123': {
    redact: 'naïveSECRET_KEY=[secret]', redact_80: 'naïveSECRET_KEY=[secret]', is_sensitive: true, why: ACCENT_BOUNDARY },
  'ñGITHUB_TOKEN=ghp_x': {
    redact: 'ñGITHUB_TOKEN=[secret]', redact_80: 'ñGITHUB_TOKEN=[secret]', is_sensitive: true, why: ACCENT_BOUNDARY },
  'раssword in cyrillic': { redact: 'password in cyrillic', redact_80: 'password in cyrillic', is_sensitive: true,
    why: 'Cyrillic look-alike letters (р, а) dodged every keyword rule; NFKC does not fold them' },
  'deadbeefdeadbeefdeadbeefdeadbeefé': { redact: '[hex]é', redact_80: '[hex]é', why: ACCENT_BOUNDARY },
  'édeadbeefdeadbeefdeadbeefdeadbeef': { redact: 'é[hex]', redact_80: 'é[hex]', why: ACCENT_BOUNDARY },
}

// URLs that backends.check_url or client._custom_typesafe_endpoint accepted although the URL
// they checked was not the one requested: Python's urlsplit drops tabs and newlines before
// checking, reads past an empty "?" or "#", and an empty user before "@", and the request then
// carries them ("https://gw.example/x?" became the endpoint ".../x?/v1/systemone", a query).
// The port refuses them all.
const CARRIES = { check_url_error: 'the URL may not carry a user, password, query or fragment' }
const INVALID = { custom_endpoint_error: 'invalid_endpoint' }
export const URL_DIVERGENCES: Record<string, { check_url?: unknown; custom_endpoint?: unknown }> = {
  // check_url strips a trailing newline before checking and returning, so only the gateway differs.
  'https://gw.example/x\n': { custom_endpoint: INVALID },
  'https://gw.ex\tample/x': { check_url: CARRIES, custom_endpoint: INVALID },
  'https://@gw.example/x': { check_url: CARRIES, custom_endpoint: INVALID },
  'https://gw.example/x?': { check_url: CARRIES, custom_endpoint: INVALID },
  'https://gw.example/x#': { check_url: CARRIES, custom_endpoint: INVALID },
  'https://gw.example/a;b=c/@d': { check_url: CARRIES, custom_endpoint: INVALID },
}
