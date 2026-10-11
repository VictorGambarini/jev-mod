// Where the bench's local site listens, known before it starts so a plan can print the prompts.
// Pure: web-server.ts (which needs the machine) imports it.

/** The base port: JEV_BENCH_PORT, else 18943. The http listener takes it, the https one the next. */
export const basePort = (port: string | undefined): number => Number(port) || 18943

const env = (): string | undefined => (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env.JEV_BENCH_PORT

/** The addresses a site on the base port has. */
export const addresses = (): { http: string; https: string } =>
  ({ http: `http://127.0.0.1:${basePort(env())}`, https: `https://127.0.0.1:${basePort(env()) + 1}` })
