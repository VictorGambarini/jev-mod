import { test, expect } from 'claude-code/testing'
import { settled } from '../../core/background'
import type { FetchInit, IO } from '../../core/io'
import { check } from './index'

// The completion gate's glue with a fake IO: in shadow the agent's stop never waits for the judgement.

const USER = '/home/u/.config/jev-mod/config.json'

test('shadow lets the agent stop before a slow backend answers, then counts the judgement once', async () => {
  let release: () => void = () => {}
  const slow = new Promise<void>(r => { release = r })
  const store: Record<string, unknown> = {}
  let asked = 0
  const files: Record<string, string> = { [USER]: JSON.stringify({ features: { 'stop-gate': { mode: 'shadow' } } }) }
  const env: Record<string, string> = { JEV_HOME: '/jev', JEV_LIMITS: 'off', TYPESAFE_API_KEY: 'test-not-a-key' }
  const fake = {
    option: () => undefined,
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    env: async (name: string) => env[name], home: async () => '/home/u', projectRoot: async () => '/p',
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }), sleep: () => new Promise<void>(() => {}),
    sessionId: async () => 'stop-session',
    storeGet: async (key: string) => store[key], storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: () => {},
    messages: async () => [{ role: 'user', text: 'fix the parser' }, { role: 'assistant', text: 'Done. All tests pass.' }],
    fetch: async (_url: string, init?: FetchInit) => {
      await slow
      asked++
      const body = JSON.parse(init!.body!)
      const answers = Object.fromEntries(Object.keys(body.questions).map(q => [q, { type: 'noul', noul: 0.9 }]))
      return { status: 200, ok: true, text: JSON.stringify({ answers, model: 'jev-test', usage: { input_tokens: 10 } }) }
    },
  } as unknown as IO
  expect(await check(fake, { promptId: 'p1', last: 'Done. All tests pass.' })).toBe(null)
  expect(asked).toBe(0) // it returned before the backend answered
  release()
  await settled()
  await new Promise(r => setTimeout(r, 10))
  expect(asked).toBeGreaterThan(0)
  const today = Object.values(store.activity as Record<string, any>)[0]['stop-gate'] as Record<string, number>
  const outcomes = ['passed', 'would-nudge', 'skipped'].reduce((n, k) => n + (today[k] ?? 0), 0)
  expect(outcomes).toBe(1) // one judgement, one outcome
  expect(today.nudged).toBe(undefined)
})

// ── on and shadow, with a fake backend that answers by question name ─────────────

const rig = (mode: string, request: string, final: string, answer: (q: string, body: any) => number, tools: unknown[] = []) => {
  const store: Record<string, unknown> = {}
  const asked: string[][] = []
  const files: Record<string, string> = { [USER]: JSON.stringify({ features: { 'stop-gate': { mode } } }) }
  const env: Record<string, string> = { JEV_HOME: '/jev', JEV_LIMITS: 'off', TYPESAFE_API_KEY: 'test-not-a-key' }
  const io = {
    option: () => undefined,
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    env: async (name: string) => env[name], home: async () => '/home/u', projectRoot: async () => '/p',
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }), sleep: () => new Promise<void>(() => {}),
    sessionId: async () => 'stop-session',
    storeGet: async (key: string) => store[key], storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: () => {},
    messages: async () => [{ role: 'user', text: request }, { role: 'assistant', text: final, toolUses: tools }],
    fetch: async (_url: string, init?: FetchInit) => {
      const body = JSON.parse(init!.body!)
      asked.push(Object.keys(body.questions))
      const answers = Object.fromEntries(Object.keys(body.questions).map(q => [q, q === 'weakest'
        ? { type: 'choice', choice: 'claim_0', probabilities: Object.fromEntries(Object.keys(body.questions.weakest.criteria).map(k => [k, k === 'claim_0' ? 1 : 0])), confidence: 1 } : { type: 'noul', noul: answer(q, body) }]))
      return { status: 200, ok: true, text: JSON.stringify({ answers, model: 'jev-test', usage: { input_tokens: 10 } }) }
    },
  } as unknown as IO
  const counts = () => (Object.values((store.activity ?? {}) as Record<string, any>)[0]?.['stop-gate'] ?? {}) as Record<string, number>
  return { io, asked, counts }
}

test('on: a turn that ends on a promise of work the person asked for is sent back, counted once', async () => {
  const final = 'The parser is edited. Let me run the tests next.'
  const r = rig('on', 'fix the parser and run the tests', final, q => (q === 'needs_person' ? 0.05 : 0.9))
  const note = await check(r.io, { promptId: 'a', last: final })
  expect(note).toContain('Let me run the tests next.')
  expect(note).toContain('Carry it out now, or say plainly')
  expect(r.asked).toEqual([['stopped_short', 'requested', 'needs_person']]) // the claims check is not run on top
  expect(r.counts().continued).toBe(1)
})

test('on: asking leave for what was already asked is sent back; a real question is not', async () => {
  const ask = 'I found the bug. Want me to go ahead and fix it?'
  const a = rig('on', 'fix it', ask, q => (q === 'needs_person' ? 0.05 : 0.9))
  expect(await check(a.io, { promptId: 'a', last: ask })).toContain('do not need their leave')
  // the model says it is a real question to the person: let it stop
  const b = rig('on', 'fix it', ask, q => (q === 'needs_person' ? 0.9 : 0.9))
  expect(await check(b.io, { promptId: 'a', last: ask })).toBe(null)
  // never asked for
  const c = rig('on', 'explain the bug', ask, q => (q === 'requested' ? 0.1 : 0.9))
  expect(await check(c.io, { promptId: 'a', last: ask })).toBe(null)
  // a choice is no candidate at all: nothing is sent
  const d = rig('on', 'fix it', 'Which file should I edit?', () => 0.9)
  expect(await check(d.io, { promptId: 'a', last: 'Which file should I edit?' })).toBe(null)
  expect(d.asked).toEqual([])
})

test('on: a hard-to-undo pending step is never pushed, and is not even asked about', async () => {
  const final = 'Tests pass locally. Want me to go ahead and push it?'
  const r = rig('on', 'fix the bug and push', final, () => 0.9)
  expect(await check(r.io, { promptId: 'a', last: final })).toBe(null)
  expect(r.asked.some(q => q.includes('stopped_short'))).toBe(false)
  expect(r.counts()['step-held']).toBe(1)
})

test('on: stopping short shares the cap of two per prompt', async () => {
  const final = 'Let me run the tests next.'
  const r = rig('on', 'run the tests', final, q => (q === 'needs_person' ? 0.05 : 0.9))
  expect(await check(r.io, { promptId: 'cap', last: final })).not.toBe(null)
  expect(await check(r.io, { promptId: 'cap', last: final })).not.toBe(null)
  expect(await check(r.io, { promptId: 'cap', last: final })).toBe(null)
  expect(r.counts().capped).toBe(1)
})

test('shadow: stopping short counts as would-continue and never stops the agent', async () => {
  const final = 'Let me run the tests next.'
  const r = rig('shadow', 'run the tests', final, q => (q === 'needs_person' ? 0.05 : 0.9))
  expect(await check(r.io, { promptId: 'a', last: final })).toBe(null)
  await settled()
  await new Promise(x => setTimeout(x, 10))
  expect(r.counts()['would-continue']).toBe(1)
  expect(r.counts().continued).toBe(undefined)
})

test('on: each claim verdict is counted, and only not-shown and could-not-tell send the agent back, with different notes', async () => {
  const final = 'Done. All tests pass.'
  // not shown
  const n = rig('on', 'fix it', final, q => (q === 'supported' ? 0.1 : q === 'cannot_tell' ? 0.05 : q === 'unverified_checks' ? 0.2 : 0.9))
  const notShown = await check(n.io, { promptId: 'n', last: final })
  expect(notShown).toContain('verify it now')
  expect(n.counts()).toMatchObject({ 'not-shown': 1, nudged: 1 })
  // could not tell
  const c = rig('on', 'fix it', final, q => (q === 'supported' ? 0.5 : q === 'cannot_tell' ? 0.9 : q === 'unverified_checks' ? 0.2 : 0.9))
  const unsure = await check(c.io, { promptId: 'c', last: final })
  expect(unsure).toContain('Run nothing more')
  expect(unsure).not.toContain('verify it now')
  expect(c.counts()).toMatchObject({ 'could-not-tell': 1, noted: 1 })
  // shown
  const s = rig('on', 'fix it', final, q => (q === 'supported' ? 0.95 : q === 'cannot_tell' ? 0.02 : q === 'unverified_checks' ? 0.02 : 0.9))
  expect(await check(s.io, { promptId: 's', last: final })).toBe(null)
  expect(s.counts()).toMatchObject({ shown: 1 })
})

// ── attributed claims and other tools' results ─────────────────────────────────

test('on: results relayed from subagents are not judged and never nudged, only counted', async () => {
  for (const final of [
    'The tool-gate agent (item 11) has finished, and its branch passes all three checks: 374 tests, the type check and validation.',
    'It reports 381 of 382 tests passing, and blames the one failure on machine load.',
    'The completion-gate agent (item 13) has finished, and its work is committed as `e8e633f`.',
    'The web-filter agent (item 16) has finished, with its work committed as `ecf6115`.',
  ]) {
    const r = rig('on', 'how are the agents doing?', final, q => (q === 'supported' ? 0.05 : q === 'cannot_tell' ? 0.05 : 0.95))
    expect(await check(r.io, { promptId: 'a', last: final })).toBe(null)
    expect(r.asked).toEqual([])
    expect(r.counts().attributed).toBe(1)
  }
})

test('on: an own claim with no run in the session is still nudged', async () => {
  const final = 'All tests pass.'
  const r = rig('on', 'fix the parser', final, q => (q === 'supported' ? 0.05 : q === 'cannot_tell' ? 0.05 : 0.95))
  expect(await check(r.io, { promptId: 'a', last: final })).toContain('"All tests pass."')
  expect(r.counts()).toMatchObject({ 'not-shown': 1, nudged: 1 })
  expect(r.counts().attributed).toBe(undefined)
})

// A fake decision model that reads the evidence: the claim is shown when a tool result says Done for every row.
const reads = (q: string, body: any) => {
  const shown = (body.state.evidence.tool_results as { output: string }[]).some(r => (r.output.match(/Done/g) ?? []).length >= 3)
  return q === 'supported' ? (shown ? 0.95 : 0.05) : q === 'cannot_tell' ? 0.05 : q === 'unverified_checks' ? 0.05 : 0.95
}
const docRead = (rows: string) => ({ tool: 'mcp__claude_ai_Claude_Docs__read', input: { ref: { object: 'node', id: 'n1' }, payload: { kind: 'view' } }, text: rows })

test('on: an MCP read whose result shows the claim is evidence, so no nudge', async () => {
  const final = 'The 3 shipped ideas are marked Done.'
  const r = rig('on', 'mark the shipped ideas done', final, reads, [docRead('<row>idea 1 | Done</row><row>idea 2 | Done</row><row>idea 3 | Done</row>')])
  expect(await check(r.io, { promptId: 'a', last: final })).toBe(null)
  expect(r.counts()).toMatchObject({ shown: 1 })
})

test('on: an MCP result that does not show the claim leaves it nudged', async () => {
  const final = 'The 3 shipped ideas are marked Done.'
  const r = rig('on', 'mark the shipped ideas done', final, reads, [docRead('<row>idea 1 | Backlog</row><row>idea 2 | Backlog</row>')])
  expect(await check(r.io, { promptId: 'a', last: final })).toContain('verify it now')
  expect(r.counts()).toMatchObject({ 'not-shown': 1, nudged: 1 })
})
