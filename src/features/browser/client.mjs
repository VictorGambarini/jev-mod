// One command to the browse tool's driver: `node client.mjs <socket>`, the command (one JSON
// line, with the driver's token) on standard input, the driver's answer (one JSON line) on
// standard output. The mod runs one of these per step (features/browser/child.ts): a spawned
// child's standard input is written once and closed, so the driver cannot be told anything
// after it starts except through its socket.

import { createConnection } from 'node:net'

const [socket] = process.argv.slice(2)

function fail(message) {
  process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n')
  process.exit(1)
}

if (!socket) fail('usage: client.mjs <socket>')

const parts = []
for await (const chunk of process.stdin) parts.push(chunk)
const line = Buffer.concat(parts).toString('utf8').trim()
if (!line) fail('no command on standard input')

const timer = setTimeout(() => fail('the browser did not answer in time'), 85_000)
const conn = createConnection(socket)
let buf = ''
conn.setEncoding('utf8')
conn.on('connect', () => conn.write(line + '\n'))
conn.on('data', chunk => {
  buf += chunk
  const nl = buf.indexOf('\n')
  if (nl < 0) return
  clearTimeout(timer)
  process.stdout.write(buf.slice(0, nl) + '\n')
  conn.destroy()
  process.exit(0)
})
conn.on('error', error => fail(`the browser is not there any more (${error.code ?? error.message})`))
conn.on('end', () => { if (!buf.includes('\n')) fail('the browser closed the connection') })
