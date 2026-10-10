import { test, expect } from 'claude-code/testing'
import {
  CHUNK_CHARS, chunksOf, droppedUnits, hitsOf, isNamed, mustKeep, namedHosts, searchRequest, termsOf, triage, unhelpful,
  UNIT_CHARS, unitsOf, withoutHits, withoutUnits,
} from './filter'

// WebSearch's record: the search model's words, and one entry holding the links.
const links = (...urls: string[]) => ({ tool_use_id: 'srvtoolu_1', content: urls.map((url, i) => ({ title: `Result ${i}`, url })) })

test('a search record\'s results are read where they sit, flat ones too', () => {
  const hits = hitsOf(['Here is what I found.', links('https://a.dev/1', 'https://b.dev/2'), { title: 'flat', url: 'https://c.dev' }])
  expect(hits.map(h => [h.at.join(','), h.url])).toEqual([['1,0', 'https://a.dev/1'], ['1,1', 'https://b.dev/2'], ['2', 'https://c.dev']])
})

test('duplicates go locally; the top 3 distinct and named hosts are never asked about', () => {
  const hits = hitsOf([links('https://a.dev', 'https://a.dev', 'https://b.dev', 'https://c.dev', 'https://d.dev',
    'https://docs.python.org/3/x', 'https://e.dev', 'https://b.dev')])
  const { duplicates, ask } = triage(hits, 3, ['python.org'])
  expect([...duplicates]).toEqual([1, 7])
  // a.dev, b.dev, c.dev are the top 3 distinct; docs.python.org is named
  expect(ask).toEqual([4, 6])
})

test('a result is dropped only when the decision model is sure enough it does not help', () => {
  const judged = unhelpful(new Map([[4, 0.05], [5, 0.2], [6, 0.21], [7, 0.9]]), 0.8)
  expect([...judged].sort()).toEqual([4, 5])
})

test('the dropped results are taken out, an emptied entry with them, and the note ends the list', () => {
  const results = ['intro', links('https://a.dev', 'https://b.dev'), links('https://c.dev')]
  const hits = hitsOf(results)
  const out = withoutHits(results, hits, new Set([1, 2]), 'NOTE')
  expect(out).toEqual(['intro', { tool_use_id: 'srvtoolu_1', content: [{ title: 'Result 0', url: 'https://a.dev' }] }, 'NOTE'])
})

test('the search request carries the query, the request, and one question per result, redacted', () => {
  const hits = hitsOf([links('https://a.dev', 'https://b.dev')])
  const { state, questions } = searchRequest('bun test runner', 'how do I mock fetch in bun', hits, [1])
  expect(Object.keys(questions)).toEqual(['r1'])
  expect((state.results as Record<string, string>).R1).toContain('https://b.dev')
  expect(state.request).toBe('how do I mock fetch in bun')
})

test('named hosts: domains and URLs, without www', () => {
  expect(namedHosts('look at https://www.Example.com/x, docs.python.org and bun.sh'))
    .toEqual(['example.com', 'docs.python.org', 'bun.sh'])
  expect(isNamed('https://sub.example.com/a', ['example.com'])).toBe(true)
  expect(isNamed('https://notexample.com/a', ['example.com'])).toBe(false)
})

const para = (topic: string, n: number) => `${`This paragraph is about ${topic} and nothing else at all. `.repeat(n).trim()}\n\n`

test('a long text is cut into units that cover it, and chunks of about 2,000 characters that overlap', () => {
  const text = Array.from({ length: 30 }, (_, i) => para(`topic ${String.fromCharCode(97 + (i % 26))}`, 5)).join('')
    + 'One very long paragraph. '.repeat(100)
  const units = unitsOf(text)
  expect(units.map(u => text.slice(u.start, u.end)).join('')).toBe(text)
  expect(units.every(u => u.end - u.start <= UNIT_CHARS)).toBe(true)
  const chunks = chunksOf(text, units)
  expect(chunks.length).toBeGreaterThan(5)
  expect(chunks.every(c => c.text.length <= CHUNK_CHARS)).toBe(true)
  // each chunk after the first starts inside the one before (the overlap), and moves on
  for (let i = 1; i < chunks.length; i++) {
    expect(chunks[i]!.units[0]!).toBeLessThanOrEqual(chunks[i - 1]!.units.at(-1)!)
    expect(chunks[i]!.units[0]!).toBeGreaterThan(chunks[i - 1]!.units[0]!)
    expect(chunks[i]!.units.at(-1)!).toBeGreaterThan(chunks[i - 1]!.units.at(-1)!)
  }
  const overlap = chunks[1]!.units.filter(u => chunks[0]!.units.includes(u))
    .reduce((sum, u) => sum + units[u]!.end - units[u]!.start, 0)
  expect(overlap).toBeGreaterThan(200)
  expect(overlap).toBeLessThanOrEqual(400)
})

test('kept without asking: the first chunk, code, dates, figures, and a heading or number the question names', () => {
  const terms = termsOf('What changed in the Installation steps for release 42?')
  expect(mustKeep('anything', 0, terms)).toBe('first')
  expect(mustKeep('Run `npm install foo` first.', 1, terms)).toBe('code')
  expect(mustKeep('Released on March 3, 2025 to everyone.', 1, terms)).toBe('date')
  expect(mustKeep('It costs $12 a month.', 1, terms)).toBe('figure')
  expect(mustKeep('Upgrade to 3.2.1 now.', 1, terms)).toBe('figure')
  expect(mustKeep('See issue 42 for this.', 1, terms)).toBe('number named')
  expect(mustKeep('## Installation\nDo the thing.', 1, terms)).toBe('heading named')
  expect(mustKeep('## Community\nJoin our forum and say hello to 3 friends.', 1, terms)).toBe(null)
})

test('a unit goes only when every chunk holding it was dropped; each run becomes one marker', () => {
  const text = 'Intro paragraph.\n\nAlpha part.\n\nBeta part.\n\nGamma part.\n\nOutro.'
  const units = unitsOf(text)
  expect(units.length).toBe(5)
  const chunks = [{ units: [0, 1], text: '' }, { units: [1, 2, 3], text: '' }, { units: [3, 4], text: '' }]
  // chunk 1 dropped: unit 1 and 3 are also in kept chunks, so only unit 2 goes
  expect([...droppedUnits(chunks, new Set([1]))]).toEqual([2])
  const out = withoutUnits(text, units, new Set([1, 2]))
  expect(out.cuts).toBe(1)
  expect(out.text).toBe('Intro paragraph.\n\n[jev-mod web filter: cut 25 characters here, starting "Alpha part. Beta part."]\n\nGamma part.\n\nOutro.')
})
