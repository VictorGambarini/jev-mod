import { test, expect } from 'claude-code/testing'
import { fakeAnswer, fakeLean } from './fake'

const options = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`o${i}`, `option ${i}`]))

test('a fake choice over many options is a valid distribution: no negative share, summing to 1, the label the largest', () => {
  for (const n of [2, 3, 5, 40, 120]) {
    for (let k = 0; k < 60; k++) {
      const a = fakeAnswer({ type: 'choice', criteria: options(n) }, `o${k % n}`, `seed:${n}:${k}`) as { choice: string; probabilities: Record<string, number> }
      const ps = Object.values(a.probabilities)
      expect(Object.keys(a.probabilities)).toHaveLength(n)
      expect(Math.min(...ps)).toBeGreaterThanOrEqual(0)
      expect(Math.abs(ps.reduce((x, y) => x + y, 0) - 1)).toBeLessThan(1e-3)
      expect(a.probabilities[a.choice]).toBe(Math.max(...ps))
    }
  }
})

test('a fake yes/no leans toward the gold label, the same every time', () => {
  const lean = fakeLean('k')
  expect(fakeLean('k')).toBe(lean)
  const yes = fakeAnswer({ type: 'noul' }, true, 'k') as { noul: number }
  const no = fakeAnswer({ type: 'noul' }, false, 'k') as { noul: number }
  expect(Math.abs(yes.noul + no.noul - 1)).toBeLessThan(1e-3)
})
