import { test, expect } from 'claude-code/testing'
import { authorize, cookie, opOf, same } from './auth.mjs'

const port = 40123
const token = 'abcdefghijklmnopqrstuvwxyz012345'
const good = { method: 'GET', path: '/api/state', host: `127.0.0.1:${port}`, cookie: `other=1; jevmod_${port}=${token}` }
const post = {
  method: 'POST', path: '/api/op', host: `localhost:${port}`, cookie: `jevmod_${port}=${token}`,
  origin: `http://localhost:${port}`, contentType: 'application/json', marker: '1',
}

test('the token is needed: from the cookie, or ?t= on the first load only', () => {
  expect(authorize(good, { port, token })).toEqual({ ok: true, via: 'cookie' })
  expect(authorize({ ...good, cookie: undefined }, { port, token })).toEqual({ ok: false, status: 403, reason: 'no token' })
  expect(authorize({ ...good, cookie: `jevmod_${port}=${token}x` }, { port, token }).ok).toBe(false)
  expect(authorize({ ...good, cookie: `jevmod_1=${token}` }, { port, token }).ok).toBe(false)
  expect(authorize({ method: 'GET', path: '/', query: token, host: `127.0.0.1:${port}` }, { port, token })).toEqual({ ok: true, via: 'query' })
  expect(authorize({ method: 'GET', path: '/api/state', query: token, host: `127.0.0.1:${port}` }, { port, token }).ok).toBe(false)
  expect(authorize({ method: 'GET', path: '/', query: '', host: `127.0.0.1:${port}` }, { port, token: '' }).ok).toBe(false)
})

test('another Host is refused (DNS rebinding), and so is another port', () => {
  expect(authorize({ ...good, host: `evil.example:${port}` }, { port, token })).toEqual({ ok: false, status: 403, reason: 'wrong host' })
  expect(authorize({ ...good, host: '127.0.0.1:1' }, { port, token }).ok).toBe(false)
  expect(authorize({ ...good, host: undefined }, { port, token }).ok).toBe(false)
})

test('a write needs the page origin, JSON and the marker header', () => {
  expect(authorize(post, { port, token })).toEqual({ ok: true, via: 'cookie' })
  expect(authorize({ ...post, origin: undefined }, { port, token }).reason).toBe('wrong origin')
  expect(authorize({ ...post, origin: 'http://evil.example' }, { port, token }).reason).toBe('wrong origin')
  expect(authorize({ ...post, origin: `https://localhost:${port}` }, { port, token }).reason).toBe('wrong origin')
  expect(authorize({ ...post, contentType: 'text/plain' }, { port, token }).status).toBe(415)
  expect(authorize({ ...post, marker: undefined }, { port, token }).reason).toBe('missing X-Jev-Mod')
  expect(authorize({ ...post, method: 'PUT' }, { port, token }).status).toBe(405)
  expect(authorize({ ...post, cookie: undefined, query: token, path: '/' }, { port, token }).reason).toBe('no token')
})

test('helpers: equal strings, cookies, op shapes', () => {
  expect(same('abc', 'abc')).toBe(true)
  expect(same('abc', 'abd')).toBe(false)
  expect(same('abc', 'abcd')).toBe(false)
  expect(same(undefined, 'abc')).toBe(false)
  expect(same('', '')).toBe(false)
  expect(cookie('a=1; b = 2', 'b')).toBe('2')
  expect(cookie(undefined, 'b')).toBe(undefined)
  expect(opOf({ op: 'set', scope: 'user', feature: 'skills', key: 'mode', value: 'on', extra: 1 }))
    .toEqual({ op: { op: 'set', scope: 'user', feature: 'skills', key: 'mode', value: 'on' } })
  expect(opOf({ op: 'reset', scope: 'project', feature: 'band' })).toEqual({ op: { op: 'reset', scope: 'project', feature: 'band' } })
  expect(opOf({ op: 'set', scope: 'user', feature: '../x', key: 'mode', value: 'on' }).problem).toBe('bad feature')
  expect(opOf({ op: 'set', scope: 'user', feature: 'skills', key: 'mode', value: [1] }).problem).toBeTruthy()
  expect(opOf([1]).problem).toBeTruthy()
})
