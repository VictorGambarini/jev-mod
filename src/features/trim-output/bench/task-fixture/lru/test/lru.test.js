const test = require('node:test')
const assert = require('node:assert')
const { LRU } = require('../src/lru')
const cases = require('./cases.json')

cases.forEach((c, i) => {
  test(`scenario ${String(i).padStart(3, '0')}: capacity ${c.cap}, ${c.ops.length} operations`, () => {
    const cache = new LRU(c.cap)
    const reads = []
    for (const [op, key, value] of c.ops) {
      if (op === 'set') cache.set(key, value)
      else reads.push(cache.has(key) ? cache.get(key) : null)
    }
    assert.deepStrictEqual(reads, c.reads)
  })
})
