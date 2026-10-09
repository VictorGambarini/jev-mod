import { commandsIn, resolvePath, writeTargets } from '../tool-gate/rules'

// The access gate's rules: which tool calls reach another machine, open a way in, or read the
// keys that would, each named by a category the person can allow for one session. Plain
// functions, no IO, no decision model: a command is cut into the commands it runs (behind sudo,
// env, timeout, nohup, xargs, `bash -c` and eval, as the tool gate reads them) and each one's
// name and arguments are matched against the categories.
//
// A pattern gate, not a sandbox: a script in Python, a compiled binary or an alias gets round it.
// It is there to stop the model's habit of logging in somewhere to try a thing, and to make it ask.

export const CATEGORIES = ['ssh', 'remote-desktop', 'cloud-shell', 'fleet', 'tunnels', 'remote-db', 'legacy', 'scanning', 'keys'] as const
export type Category = (typeof CATEGORIES)[number]

/** One line per category, for /jev-mod access and the docs. */
export const ABOUT: Record<Category, string> = {
  ssh: 'ssh, scp, sftp, mosh, autossh, sshpass, ssh-copy-id, sshfs, rsync to a host: path or over -e ssh (never git)',
  'remote-desktop': 'xfreerdp, rdesktop, remmina, vncviewer, x2goclient, rdp:// and vnc:// links',
  'cloud-shell': 'aws ssm start-session, gcloud compute ssh, az ssh, kubectl exec/cp/port-forward, oc rsh, remote docker exec, virsh console, vagrant ssh, multipass shell',
  fleet: 'ansible, ansible-playbook, pssh, salt, fab, pdsh, clush',
  tunnels: 'ssh -L/-R/-D, ngrok, cloudflared tunnel, tailscale serve/funnel/up, chisel, frpc, socat/nc listening, localtunnel, bore',
  'remote-db': 'psql, mysql, mongosh, redis-cli, sqlcmd to a host other than this machine',
  legacy: 'telnet, ftp, lftp, tftp, rlogin, rsh, smbclient, mount -t cifs/nfs',
  scanning: 'nmap, masscan, zmap, rustscan',
  keys: 'reading or copying private keys and credential stores (~/.ssh/id_*, ~/.aws/credentials, ~/.kube/config, ...), writing ~/.ssh/authorized_keys or ~/.ssh/config',
}

export function isCategory(word: string): word is Category {
  return (CATEGORIES as readonly string[]).includes(word)
}

/**
 * One thing a call does that a category covers. `hosts`: the machines it reaches, as far as they
 * could be read; empty when it names none that could be read (a host scope then refuses it).
 */
export type Hit = { category: Category; command: string; hosts: string[] }

// ── hosts ────────────────────────────────────────────────────────────────────

/** `user@host:port`, `ssh://user@host:22/x`, `[::1]:22` -> the host alone, lower case; '' when there is none. */
export function hostOf(target: string): string {
  let t = target.trim()
  t = t.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') // a scheme
  t = t.replace(/\/.*$/, '') // a path after the authority
  if (t.includes('@')) t = t.slice(t.lastIndexOf('@') + 1)
  const v6 = /^\[([^\]]*)\]/.exec(t)
  if (v6) return v6[1]!.toLowerCase()
  if ((t.match(/:/g) ?? []).length > 1) return t.toLowerCase() // a bare IPv6 address
  return t.replace(/:.*$/, '').toLowerCase()
}

/** Whether a host is this machine: localhost, a loopback address, or a unix socket's path. */
export function isLocal(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!h || h.startsWith('/') || h === '.' || h === '(local)') return true
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '0:0:0:0:0:0:0:1' || /^127(?:\.\d{1,3}){3}$/.test(h)
}

/** Whether a host matches one of a scope's patterns: the same name, or a `*` glob (`*.lab.example`). */
export function hostMatches(host: string, patterns: readonly string[]): boolean {
  const h = host.toLowerCase()
  return patterns.some(p => {
    const q = p.toLowerCase()
    if (!q.includes('*')) return h === q
    const re = new RegExp(`^${q.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
    return re.test(h)
  })
}

// ── reading a command's words ───────────────────────────────────────────────

type Parsed = { flags: Map<string, string[]>; operands: string[] }

/**
 * A command's options and operands, as getopt reads them: `takes` names the options that take a
 * value (short ones as one letter, long ones with their dashes). Joined short flags (`-fNL 80:h:80`)
 * and `--opt=value` are read too. Everything after `--` is an operand.
 */
function parseArgs(words: readonly string[], takes: string, longTakes: readonly string[] = []): Parsed {
  const flags = new Map<string, string[]>()
  const put = (name: string, value = '') => flags.set(name, [...(flags.get(name) ?? []), value])
  const operands: string[] = []
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!
    if (w === '--') { operands.push(...words.slice(i + 1)); break }
    if (w.startsWith('--')) {
      const eq = w.indexOf('=')
      const name = eq === -1 ? w : w.slice(0, eq)
      if (eq !== -1) put(name, w.slice(eq + 1))
      else if (longTakes.includes(name)) { put(name, words[i + 1] ?? ''); i++ }
      else put(name)
      continue
    }
    if (w.startsWith('-') && w.length > 1) {
      for (let j = 1; j < w.length; j++) {
        const c = w[j]!
        if (takes.includes(c)) {
          const rest = w.slice(j + 1)
          if (rest) put(`-${c}`, rest)
          else { put(`-${c}`, words[i + 1] ?? ''); i++ }
          break
        }
        put(`-${c}`)
      }
      continue
    }
    operands.push(w)
  }
  return { flags, operands }
}

const first = (p: Parsed, ...names: string[]) => names.map(n => p.flags.get(n)?.[0]).find(v => v !== undefined)
const has = (p: Parsed, ...names: string[]) => names.some(n => p.flags.has(n))

/** The non-option words of a command, the values of `valued` options skipped: its subcommands first. */
function verbs(words: readonly string[], valued: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!
    if (w === '--') break
    if (w.startsWith('-')) { if (!w.includes('=') && valued.includes(w)) i++; continue }
    out.push(w)
  }
  return out
}

/** Whether a command only asks for its version or help. */
function onlyAsks(words: readonly string[]): boolean {
  return words.length > 1 && words.slice(1).every(w => ['-V', '-v', '--version', 'version', '-h', '--help', 'help', '-?'].includes(w))
}

/** `host:path`, `user@host:path`, `host::module` (rsync), `scheme://host/...`: the host, or null for a local path. */
function remoteOperand(word: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(word)) return hostOf(word) || null
  if (word.startsWith('/') || word.startsWith('.') || word.startsWith('~')) return null
  const m = /^((?:[^@/:\s]+@)?(?:\[[^\]]+\]|[^/:\s[\]]+)):/.exec(word)
  return m ? hostOf(m[1]!) || null : null
}

// ── each category's commands ────────────────────────────────────────────────

const SSH_TAKES = 'BbcDEeFIiJLlmOoPpQRSWw'
const SCP_TAKES = 'cFiJlloPSX'
const SFTP_TAKES = 'BbcDFiJloPRSsX'

type Found = { category: Category; hosts: string[] }

/** ssh's destination and jump hosts, and whether it opens a tunnel. */
function sshHits(words: readonly string[]): Found[] {
  const p = parseArgs(words, SSH_TAKES)
  const dest = p.operands[0]
  if (dest === undefined) return [] // no destination: it connects nowhere
  const hosts = [hostOf(dest), ...(p.flags.get('-J') ?? []).flatMap(j => j.split(',').map(hostOf))].filter(Boolean)
  const out: Found[] = [{ category: 'ssh', hosts }]
  if (has(p, '-L', '-R', '-D', '-w')) out.push({ category: 'tunnels', hosts })
  return out
}

function scpHits(words: readonly string[], takes: string): Found[] {
  const p = parseArgs(words, takes)
  const hosts = p.operands.map(remoteOperand).filter((h): h is string => h !== null)
  return hosts.length ? [{ category: 'ssh', hosts }] : []
}

function rsyncHits(words: readonly string[]): Found[] {
  const p = parseArgs(words, 'efTBM', ['--rsh', '--filter', '--exclude', '--include', '--exclude-from', '--include-from',
    '--files-from', '--rsync-path', '--temp-dir', '--log-file', '--port', '--chmod', '--chown', '--password-file'])
  const hosts = p.operands.map(remoteOperand).filter((h): h is string => h !== null)
  const viaSsh = [...(p.flags.get('-e') ?? []), ...(p.flags.get('--rsh') ?? [])].some(v => /\bssh\b/.test(v))
  return hosts.length || viaSsh ? [{ category: 'ssh', hosts }] : []
}

const hostsOf = (...values: (string | undefined)[]) => values.filter((v): v is string => !!v).map(hostOf).filter(Boolean)

/** A database client's host: -h/--host, a URI, `host=` in a connection string; null when it names none (this machine). */
function dbHits(name: string, words: readonly string[], line: string): Found[] {
  let hosts: string[] = []
  const uris = words.slice(1).flatMap(w => [...w.matchAll(/\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?):\/\/([^/?\s]*)/gi)])
    .flatMap(m => m[1]!.replace(/^.*@/, '').split(',').map(hostOf))
  const kv = words.slice(1).flatMap(w => [...w.matchAll(/(?:^|\s|;)(?:host|server|data source|addr|address)\s*=\s*([^\s;]+)/gi)].map(m => m[1]!))
  switch (name) {
    case 'psql': case 'pg_dump': case 'pg_restore': case 'pg_dumpall': {
      const p = parseArgs(words, 'hpUdcfFoLTvWPl', ['--host', '--port', '--username', '--dbname', '--command', '--file'])
      hosts = hostsOf(first(p, '-h', '--host'), ...(/(?:^|\s)PGHOST=(\S+)/.exec(line)?.slice(1) ?? []))
      break
    }
    case 'mysql': case 'mariadb': case 'mysqldump': case 'mariadb-dump': {
      const p = parseArgs(words, 'hPuDeSp', ['--host', '--port', '--user', '--database', '--execute', '--socket'])
      if (has(p, '-S', '--socket') && !has(p, '-h', '--host')) return []
      hosts = hostsOf(first(p, '-h', '--host'), ...(/(?:^|\s)MYSQL_HOST=(\S+)/.exec(line)?.slice(1) ?? []))
      break
    }
    case 'mongosh': case 'mongo': case 'mongodump': case 'mongorestore': {
      const p = parseArgs(words, 'uph', ['--host', '--port', '--username', '--password', '--eval', '--file'])
      hosts = hostsOf(...(first(p, '--host') ?? '').split(','))
      break
    }
    case 'redis-cli': {
      const p = parseArgs(words, 'hpsanuc', ['--user', '--pass'])
      if (has(p, '-s') && !has(p, '-h')) return []
      hosts = hostsOf(first(p, '-h'))
      break
    }
    case 'sqlcmd': {
      const p = parseArgs(words, 'SUPdQqiovH')
      const server = first(p, '-S')
      hosts = server ? [server.replace(/^(?:tcp|np|lpc):/i, '').replace(/[\\,].*$/, '').toLowerCase()] : []
      break
    }
  }
  const remote = [...hosts, ...uris, ...kv.map(hostOf)].filter(h => !isLocal(h))
  return remote.length ? [{ category: 'remote-db', hosts: remote }] : []
}

const DB = new Set(['psql', 'pg_dump', 'pg_dumpall', 'pg_restore', 'mysql', 'mariadb', 'mysqldump', 'mariadb-dump',
  'mongosh', 'mongo', 'mongodump', 'mongorestore', 'redis-cli', 'sqlcmd'])
const FLEET = new Set(['ansible', 'ansible-playbook', 'ansible-console', 'ansible-pull', 'pssh', 'parallel-ssh', 'prsync',
  'parallel-scp', 'pscp.pssh', 'salt', 'salt-ssh', 'salt-call', 'fab', 'pdsh', 'pdcp', 'clush'])
const SCANNERS = new Set(['nmap', 'masscan', 'zmap', 'rustscan'])
const RDP = new Set(['xfreerdp', 'xfreerdp3', 'wlfreerdp', 'wlfreerdp3', 'sdl-freerdp', 'rdesktop', 'remmina', 'vncviewer',
  'xtightvncviewer', 'xvncviewer', 'tigervnc', 'x2goclient', 'krdc', 'vinagre'])
const LEGACY = new Set(['telnet', 'ftp', 'lftp', 'tftp', 'rlogin', 'rsh', 'rcp', 'rexec', 'smbclient', 'mount.cifs', 'mount.nfs', 'mount.nfs4', 'mount.smbfs'])
const DOCKER_VALUED = ['-H', '--host', '-c', '--context', '--config', '-l', '--log-level']
const KUBE_VALUED = ['-n', '--namespace', '--context', '--cluster', '--user', '-s', '--server', '--kubeconfig', '--as', '--token', '-c', '--container']

/** A remote docker daemon: -H/--host or --context to elsewhere, or DOCKER_HOST set on the line to elsewhere. */
function dockerRemote(words: readonly string[], line: string): string[] | null {
  // docker's global options come before its subcommand
  const end = words.findIndex((w, i) => i > 0 && !w.startsWith('-') && !DOCKER_VALUED.includes(words[i - 1]!))
  const p = parseArgs(words.slice(0, end === -1 ? words.length : end), 'Hcl', DOCKER_VALUED.filter(o => o.startsWith('--')))
  const host = first(p, '-H', '--host')
  const context = first(p, '-c', '--context')
  const env = /(?:^|\s|;)(?:export\s+)?DOCKER_HOST=['"]?([^\s'";]+)/.exec(line)?.[1]
  const addr = host ?? env
  if (addr !== undefined && !/^(?:unix|npipe):\/\//i.test(addr) && !isLocal(hostOf(addr))) return [hostOf(addr)].filter(Boolean)
  if (context !== undefined && context !== 'default' && context !== 'desktop-linux') return []
  return null
}

/** The categories one command (its words, its name bare) falls under. `line` is the whole line, for the variables it sets. */
export function commandHits(words: readonly string[], line = ''): Found[] {
  const name = words[0]
  if (!name || onlyAsks(words)) return []
  switch (name) {
    case 'ssh': return sshHits(words)
    case 'autossh': {
      // autossh [-M port[:echo]] [ssh options] destination: ssh's, less its monitor port
      const rest: string[] = []
      for (let i = 1; i < words.length; i++) {
        if (words[i] === '-M') { i++; continue }
        if (/^-M\d/.test(words[i]!)) continue
        rest.push(words[i]!)
      }
      return sshHits(['ssh', ...rest])
    }
    case 'scp': return scpHits(words, SCP_TAKES)
    case 'sftp': {
      const p = parseArgs(words, SFTP_TAKES)
      return p.operands[0] ? [{ category: 'ssh', hosts: hostsOf(p.operands[0]) }] : []
    }
    case 'mosh': {
      const p = parseArgs(words, 'p', ['--ssh', '--port', '--server', '--client', '--predict', '--family', '--bind-server'])
      return p.operands[0] ? [{ category: 'ssh', hosts: hostsOf(p.operands[0]) }] : []
    }
    case 'ssh-copy-id': {
      const p = parseArgs(words, 'iFpoxt')
      return [{ category: 'ssh', hosts: hostsOf(p.operands[0]) }]
    }
    case 'sshpass': {
      // sshpass [-p pw|-f file|-d fd|-e] command...: the command it runs is what counts, and sshpass itself is ssh's
      let i = 1
      while (i < words.length && words[i]!.startsWith('-')) i += /^-[pfdP]$/.test(words[i]!) ? 2 : 1
      const inner = words.slice(i)
      const below = inner.length ? commandHits([inner[0]!.replace(/^.*\//, ''), ...inner.slice(1)], line) : []
      return below.some(h => h.category === 'ssh') ? below : [{ category: 'ssh', hosts: [] }, ...below]
    }
    case 'sshfs': {
      const p = parseArgs(words, 'opF')
      const hosts = p.operands.map(remoteOperand).filter((h): h is string => h !== null)
      return [{ category: 'ssh', hosts }]
    }
    case 'rsync': return rsyncHits(words)

    case 'xdg-open': case 'open': case 'gio': case 'gnome-open': case 'kde-open': {
      const url = words.slice(1).find(w => /^(?:rdp|vnc|spice|x2go|ssh|telnet):\/\//i.test(w))
      if (!url) return []
      const scheme = url.slice(0, url.indexOf(':')).toLowerCase()
      const category: Category = scheme === 'ssh' ? 'ssh' : scheme === 'telnet' ? 'legacy' : 'remote-desktop'
      return [{ category, hosts: hostsOf(url) }]
    }

    case 'aws': {
      const v = verbs(words, ['--region', '--profile', '--output', '--endpoint-url', '--query', '--color', '--ca-bundle', '--cli-read-timeout', '--cli-connect-timeout'])
      if ((v[0] === 'ssm' && v[1] === 'start-session') || v[0] === 'ec2-instance-connect') {
        const p = parseArgs(words, '', ['--target', '--instance-id', '--region', '--profile'])
        return [{ category: 'cloud-shell', hosts: hostsOf(first(p, '--target', '--instance-id')) }]
      }
      return []
    }
    case 'gcloud': {
      const v = verbs(words, ['--project', '--zone', '--region', '--account', '--configuration', '--format', '--verbosity',
        '--impersonate-service-account', '--billing-project', '--flags-file', '--command', '--ssh-flag', '--ssh-key-file'])
      for (let i = 0; i + 1 < v.length; i++) {
        if ((v[i] === 'compute' || v[i] === 'cloud-shell') && (v[i + 1] === 'ssh' || v[i + 1] === 'scp')) {
          const rest = v.slice(i + 2)
          const hosts = v[i + 1] === 'ssh' ? hostsOf(rest[0]) : rest.map(remoteOperand).filter((h): h is string => h !== null)
          return [{ category: 'cloud-shell', hosts }]
        }
      }
      return []
    }
    case 'az': {
      const v = verbs(words, ['--subscription', '-g', '--resource-group', '-n', '--name', '-o', '--output', '--query', '--ip', '--command-id', '--scripts'])
      if (v[0] === 'ssh' || (v[0] === 'vm' && v[1] === 'run-command')) {
        const p = parseArgs(words, 'ng', ['--name', '--ip', '--resource-group', '--vm-name'])
        return [{ category: 'cloud-shell', hosts: hostsOf(first(p, '--ip', '--name', '-n', '--vm-name')) }]
      }
      return []
    }
    case 'kubectl': case 'oc': case 'k': {
      const v = verbs(words, KUBE_VALUED)
      const risky = name === 'oc' ? ['rsh', 'exec', 'attach', 'cp', 'port-forward', 'debug', 'rsync'] : ['exec', 'attach', 'cp', 'port-forward', 'debug']
      if (v[0] && risky.includes(v[0])) return [{ category: 'cloud-shell', hosts: v[0] === 'cp' ? [] : hostsOf(v[1]?.replace(/^(?:pod|pods|deploy|deployment|svc|service)\//, '')) }]
      return []
    }
    case 'docker': case 'podman': {
      const v = verbs(words, ['-H', '--host', '-c', '--context', '--config', '-l', '--log-level', '--url', '--connection'])
      const verb = v[0] === 'container' ? v[1] : v[0]
      if (verb !== 'exec' && verb !== 'cp') return []
      if (name === 'podman') {
        const p = parseArgs(words, '', ['--url', '--connection'])
        return has(p, '--remote', '-r', '--url', '--connection') ? [{ category: 'cloud-shell', hosts: hostsOf(first(p, '--url')) }] : []
      }
      const remote = dockerRemote(words, line)
      return remote ? [{ category: 'cloud-shell', hosts: remote }] : []
    }
    case 'virsh': {
      const v = verbs(words, ['-c', '--connect', '-l', '--log', '-d', '--debug', '-k', '--keepalive-interval'])
      return v[0] === 'console' ? [{ category: 'cloud-shell', hosts: hostsOf(v[1]) }] : []
    }
    case 'vagrant': {
      const v = verbs(words, [])
      return v[0] === 'ssh' ? [{ category: 'cloud-shell', hosts: hostsOf(v[1]) }] : []
    }
    case 'multipass': {
      const v = verbs(words, [])
      return v[0] === 'shell' || v[0] === 'sh' || v[0] === 'exec' ? [{ category: 'cloud-shell', hosts: hostsOf(v[1] ?? 'primary') }] : []
    }

    case 'ngrok': case 'chisel': case 'frpc': case 'frps': case 'bore': case 'lt': case 'localtunnel':
      return [{ category: 'tunnels', hosts: [] }]
    case 'cloudflared': {
      const v = verbs(words, ['--config', '--loglevel', '--logfile', '--origincert', '--url', '--hostname'])
      return v[0] === 'tunnel' || v[0] === 'access' ? [{ category: v[0] === 'access' ? 'ssh' : 'tunnels', hosts: [] }] : []
    }
    case 'tailscale': {
      const v = verbs(words, ['--socket'])
      if (v[0] === 'ssh') return [{ category: 'ssh', hosts: hostsOf(v[1]) }]
      return v[0] === 'serve' || v[0] === 'funnel' || v[0] === 'up' ? [{ category: 'tunnels', hosts: [] }] : []
    }
    case 'socat':
      return words.slice(1).some(w => /^(?:tcp[46]?|udp[46]?|openssl|sctp[46]?|unix)-listen\b/i.test(w)) ? [{ category: 'tunnels', hosts: [] }] : []
    case 'nc': case 'ncat': case 'netcat': {
      const p = parseArgs(words, 'pswiIOqTVxXecb', ['--sh-exec', '--exec', '--source', '--source-port'])
      return has(p, '-l', '--listen') ? [{ category: 'tunnels', hosts: [] }] : []
    }

    case 'mount': {
      const p = parseArgs(words, 'toOL', ['--types', '--options'])
      const type = first(p, '-t', '--types') ?? ''
      const remote = p.operands.map(o => (/^\/\/([^/]+)/.exec(o)?.[1]) ?? remoteOperand(o)).filter((h): h is string => !!h)
      if (/\b(?:cifs|smb3?|smbfs|nfs4?|fuse\.sshfs|sshfs)\b/i.test(type) || remote.length) return [{ category: 'legacy', hosts: remote.map(hostOf) }]
      return []
    }
  }
  if (DB.has(name)) return dbHits(name, words, line)
  if (FLEET.has(name)) return [{ category: 'fleet', hosts: [] }]
  if (SCANNERS.has(name)) return [{ category: 'scanning', hosts: [] }]
  if (RDP.has(name)) {
    const v = words.slice(1).find(w => /^\/v:/i.test(w))?.slice(3)
      ?? words.slice(1).find(w => /^(?:rdp|vnc):\/\//i.test(w))
      ?? (name === 'remmina' || name === 'x2goclient' ? undefined : words.slice(1).find(w => !w.startsWith('-') && !w.startsWith('/')))
    return [{ category: 'remote-desktop', hosts: hostsOf(v) }]
  }
  if (LEGACY.has(name)) {
    if (name === 'smbclient') {
      const share = words.slice(1).find(w => w.startsWith('//'))
      return [{ category: 'legacy', hosts: share ? hostsOf(share.slice(2)) : [] }]
    }
    const operand = words.slice(1).find(w => !w.startsWith('-'))
    return [{ category: 'legacy', hosts: hostsOf(operand) }]
  }
  return []
}

// ── keys ─────────────────────────────────────────────────────────────────────

/** A path that holds a private key or a credential store (read or written, either is a hit). */
export function isSecretPath(full: string): boolean {
  const base = full.slice(full.lastIndexOf('/') + 1)
  if (/\/\.ssh\/[^/]+$/.test(full)) {
    if (base.endsWith('.pub') || base.startsWith('authorized_keys') || base === 'known_hosts' || base.startsWith('known_hosts')) return false
    if (base === 'config' || base === 'environment' || base === 'rc') return false
    return base.startsWith('id_') || /key/i.test(base) || /[*?[]/.test(base)
  }
  return /\/\.aws\/credentials$/.test(full) || /\/\.kube\/config$/.test(full) || /\/\.docker\/config\.json$/.test(full)
    || /\/\.netrc$/.test(full) || /\/\.gnupg\/(?:private-keys-v1\.d|secring\.gpg)(?:\/|$)/.test(full)
    || /\/\.config\/gcloud\/(?:credentials\.db|legacy_credentials|access_tokens\.db|application_default_credentials\.json)/.test(full)
    || /\/\.azure\/(?:accessTokens\.json|msal_token_cache)/.test(full)
}

/** A folder whose whole content a command would read keys from: ~/.ssh, ~/.aws, ~/.kube, ~/.gnupg. */
function isSecretDir(full: string): boolean {
  return /\/\.(?:ssh|aws|kube|gnupg)\/?$/.test(full)
}

/** A path whose writing changes who may log in here, or how this machine logs in elsewhere. */
export function isAccessConfig(full: string): boolean {
  return /\/\.ssh\/(?:authorized_keys2?|config)$/.test(full)
}

// Commands that take a path without reading what is in it.
const NO_READ = new Set(['ls', 'stat', 'test', '[', 'chmod', 'chown', 'chgrp', 'file', 'du', 'realpath', 'readlink',
  'dirname', 'basename', 'mkdir', 'touch', 'cd', 'pushd', 'ssh-add', 'which', 'type', 'echo', 'printf'])
// ssh-family options whose value is a key used to log in, not a key read out.
const IDENTITY_OPTS = new Set(['-i'])
const SSH_FAMILY = new Set(['ssh', 'scp', 'sftp', 'sshfs', 'autossh', 'ssh-copy-id', 'mosh', 'rsync'])

const REDIRECT = /(?:^|[^0-9&<>])>{1,2}\|?\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|<>()]+))/g

/** What one command does to keys: reads or copies a private key or credential store, or writes an access config. */
function keyHit(words: readonly string[], home: string | undefined): boolean {
  const name = words[0]!
  const resolve = (w: string) => resolvePath(w, undefined, home) ?? (w.startsWith('/') ? w : null)
  if (name === 'gpg' || name === 'gpg2') {
    return words.some(w => /^--export-secret-(?:sub)?keys$/.test(w))
  }
  // writes: cp/mv/ln/install/tee/dd/sed -i targets onto an access config or a key
  const targets = name === 'mv' ? words.slice(1).filter(w => !w.startsWith('-')).slice(-1) : writeTargets(words)
  if (targets.some(t => { const full = resolve(t); return full !== null && (isAccessConfig(full) || isSecretPath(full)) })) return true
  if (NO_READ.has(name)) return false
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!
    if (SSH_FAMILY.has(name) && IDENTITY_OPTS.has(w)) { i++; continue }
    if (SSH_FAMILY.has(name) && /^-i./.test(w)) continue
    if (SSH_FAMILY.has(name) && /^-oIdentityFile|^IdentityFile=/i.test(w)) continue
    if (SSH_FAMILY.has(name) && words[i - 1] === '-o' && /^IdentityFile/i.test(w)) continue
    const value = w.startsWith('-') && w.includes('=') ? w.slice(w.indexOf('=') + 1) : w
    if (value.startsWith('-')) continue
    const full = resolve(value.replace(/^[a-z]+=/i, ''))
    if (full !== null && (isSecretPath(full) || isSecretDir(full))) return true
  }
  return false
}

/** Redirections on the line that write to an access config or a key file (`>> ~/.ssh/authorized_keys`). */
function redirectKeyHit(line: string, home: string | undefined): boolean {
  for (const m of line.matchAll(REDIRECT)) {
    const target = m[1] ?? m[2] ?? m[3] ?? ''
    const full = resolvePath(target, undefined, home) ?? (target.startsWith('/') ? target : null)
    if (full !== null && (isAccessConfig(full) || isSecretPath(full))) return true
  }
  return false
}

// ── a call ───────────────────────────────────────────────────────────────────

const SHOWN = 120
const shown = (text: string) => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > SHOWN ? `${one.slice(0, SHOWN - 1)}…` : one
}

/** Every category a Bash command line falls under, each with the command that did it. */
export function bashHits(command: string, home?: string): Hit[] {
  if (!command.trim()) return []
  const out: Hit[] = []
  const seen = new Set<string>()
  const add = (category: Category, cmd: string, hosts: string[]) => {
    const key = `${category}\0${cmd}\0${hosts.join(',')}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ category, command: shown(cmd), hosts })
  }
  for (const words of commandsIn(command)) {
    const text = words.join(' ')
    for (const found of commandHits(words, command)) add(found.category, text, found.hosts)
    if (keyHit(words, home)) add('keys', text, [])
  }
  if (redirectKeyHit(command, home)) add('keys', command, [])
  return out
}

/** The path a file tool reads or writes, and whether it writes. */
const FILE_TOOLS: Record<string, { field: string; writes: boolean }> = {
  Read: { field: 'file_path', writes: false },
  Write: { field: 'file_path', writes: true },
  Edit: { field: 'file_path', writes: true },
  MultiEdit: { field: 'file_path', writes: true },
  NotebookEdit: { field: 'notebook_path', writes: true },
  Grep: { field: 'path', writes: false },
}

/** An MCP tool's name read as words: mcp__ssh-server__run_command -> mcp, ssh, server, run, command. */
function nameWords(tool: string): string[] {
  return tool.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/** The category an MCP tool's name puts it in, or null. */
export function mcpCategory(tool: string): Category | null {
  if (!tool.startsWith('mcp__') || tool.startsWith('mcp__jev-mod__')) return null
  const words = nameWords(tool)
  if (words.some(w => w === 'ssh' || w === 'sftp' || w === 'scp')) return 'ssh'
  if (words.some(w => w === 'rdp' || w === 'vnc')) return 'remote-desktop'
  if (words.some(w => ['remote', 'shell', 'exec', 'kubectl', 'k8s', 'kubernetes'].includes(w))) return 'cloud-shell'
  return null
}

/** Whether the gate looks at this tool at all: Bash, the file tools, an MCP tool. Pure, so a call it never judges costs nothing. */
export function concerns(tool: string): boolean {
  return tool === 'Bash' || tool in FILE_TOOLS || (tool.startsWith('mcp__') && mcpCategory(tool) !== null)
}

/** Every category a tool call falls under. */
export function hitsOf(tool: string, input: unknown, home?: string): Hit[] {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (tool === 'Bash') return bashHits(String(fields.command ?? ''), home)
  const file = FILE_TOOLS[tool]
  if (file) {
    const path = fields[file.field]
    if (typeof path !== 'string' || !path) return []
    const full = resolvePath(path, undefined, home) ?? (path.startsWith('/') ? path : null)
    if (full === null) return []
    const hit = isSecretPath(full) || (tool === 'Grep' && isSecretDir(full)) || (file.writes && isAccessConfig(full))
    return hit ? [{ category: 'keys', command: `${tool} ${path}`, hosts: [] }] : []
  }
  const category = mcpCategory(tool)
  if (!category) return []
  const host = ['host', 'hostname', 'server', 'target', 'address'].map(k => fields[k]).find(v => typeof v === 'string') as string | undefined
  return [{ category, command: tool, hosts: hostsOf(host) }]
}

// ── the verdict ──────────────────────────────────────────────────────────────

/** This session's allows: a category with no hosts is open to every host; with hosts, only to those. */
export type Grants = Partial<Record<Category, { hosts?: string[] }>>

export type Verdict = { blocked: Hit[]; allowed: Hit[] }

/**
 * Which hits are blocked: a category allowed in every session (`always`) or this one passes,
 * unless the session scoped it to hosts and a hit names a host outside them (or none that could
 * be read). With `allowLocalhost`, a hit whose every host is this machine passes too.
 */
export function judge(hits: readonly Hit[], grants: Grants, always: readonly Category[], allowLocalhost: boolean): Verdict {
  const blocked: Hit[] = []
  const allowed: Hit[] = []
  for (const hit of hits) {
    if (allowLocalhost && hit.category !== 'keys' && hit.hosts.length && hit.hosts.every(isLocal)) continue
    const grant = grants[hit.category]
    const scoped = grant?.hosts?.length ? grant.hosts : null
    const open = always.includes(hit.category) || (grant !== undefined && (scoped === null
      || (hit.hosts.length > 0 && hit.hosts.every(h => hostMatches(h, scoped)))))
    ;(open ? allowed : blocked).push(hit)
  }
  return { blocked, allowed }
}

/** What the model reads when a call is refused: which category, which command, and what to do instead. */
export function refusal(blocked: readonly Hit[], grants: Grants): string {
  const lines = ['jev-mod access gate refused this call.']
  const categories = [...new Set(blocked.map(h => h.category))]
  for (const category of categories) {
    const hits = blocked.filter(h => h.category === category)
    const scoped = grants[category]?.hosts
    const where = scoped?.length
      ? ` to ${hits.flatMap(h => h.hosts).filter(Boolean).join(', ') || 'a host it could not read'} (this session allows ${category} only to ${scoped.join(', ')})`
      : ''
    lines.push(`This session does not allow ${category}${where}: \`${hits[0]!.command}\`.`)
  }
  const named = categories.join(', ')
  const how = categories.map(c => `/jev-mod access ${c} on`).join(' and ')
  lines.push(`Do not try another way round it. Ask the person to run it themselves, or to allow ${named} for this session with ${how}.`)
  return lines.join('\n')
}

/** `ssh`, `ssh (vm1, *.lab)`: an open category as the band and /jev-mod access show it. */
export function label(category: string, grant: { hosts?: string[] } | undefined): string {
  return grant?.hosts?.length ? `${category} (${grant.hosts.join(', ')})` : category
}

/** The categories in a list knob's text, in the registry's order; unknown words are dropped. */
export function categoriesIn(text: unknown): Category[] {
  const words = String(text ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean)
  return CATEGORIES.filter(c => words.includes(c))
}
