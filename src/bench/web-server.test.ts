import { test, expect } from 'claude-code/testing'
import { addresses, basePort } from './web-server-address'

test('the site\'s addresses are fixed before it starts: http on the base port, https on the next', () => {
  const a = addresses()
  expect(a.http).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  expect(Number(a.https.split(':').pop())).toBe(Number(a.http.split(':').pop()) + 1)
  expect(a.https.startsWith('https://')).toBe(true)
})

test('the base port is JEV_BENCH_PORT when it is a number, else 18943', () => {
  expect(basePort(undefined)).toBe(18943)
  expect(basePort('')).toBe(18943)
  expect(basePort('x')).toBe(18943)
  expect(basePort('20100')).toBe(20100)
})
