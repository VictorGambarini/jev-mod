type Fields = Record<string, unknown>

const level = process.env.LOG_LEVEL ?? 'info'

function write(kind: string, message: string, fields: Fields = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), kind, message, ...fields }))
}

export const log = {
  debug: (m: string, f?: Fields) => { if (level === 'debug') write('debug', m, f) },
  info: (m: string, f?: Fields) => write('info', m, f),
  warn: (m: string, f?: Fields) => write('warn', m, f),
  error: (m: string, f?: Fields) => write('error', m, f),
}
