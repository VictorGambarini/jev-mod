// Work a hook starts and does not wait for: a shadow judgement changes nothing the turn reads,
// so it must never hold the turn up. Each piece runs once, whatever it throws is dropped (it
// counts its own outcome before it can fail, never after), and a test can wait for it.

const running = new Set<Promise<void>>()

/** Start `work` now and return at once; nothing it throws or rejects with escapes. */
export function inBackground(work: () => Promise<unknown>): void {
  let done: Promise<void>
  try {
    done = Promise.resolve(work()).then(() => {}, () => {})
  } catch {
    return
  }
  running.add(done)
  void done.then(() => { running.delete(done) })
}

/** Resolves once everything started so far, and anything that started meanwhile, has settled. */
export async function settled(): Promise<void> {
  while (running.size) await Promise.all([...running])
}
