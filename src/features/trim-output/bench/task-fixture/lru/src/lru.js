// A small LRU cache: get() and set() both make a key the most recently used.
class LRU {
  constructor(capacity) {
    this.capacity = capacity
    this.map = new Map()
  }

  get(key) {
    const value = this.map.get(key)
    if (value) {
      // refresh: move the key to the end
      this.map.delete(key)
      this.map.set(key, value)
    }
    return value
  }

  set(key, value) {
    this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.capacity) {
      this.map.delete(this.map.keys().next().value)
    }
    return this
  }

  has(key) {
    return this.map.has(key)
  }

  get size() {
    return this.map.size
  }
}

module.exports = { LRU }
