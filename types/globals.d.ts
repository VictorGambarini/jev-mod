// The kit's declarations leave out two globals the tests use (the runtime is Node-compatible).
declare const console: { log(...args: unknown[]): void }
declare function setTimeout(handler: (...args: never[]) => void, ms?: number): unknown
