// find-files' symbol rules: plain functions, no IO. Where a name is defined, and where it is
// used, read from the code itself and not from its comments or strings.
//
//   1. strip: a file's comments and string contents become spaces, so every line keeps its
//      length and number, and a name inside a comment or a string is no longer there.
//   2. definitions: per language (TS/JS, Python, Go, Rust, Java and its kin, Ruby), the lines
//      that define a name: a function, a method, a class or type, a constant or variable at the
//      top of a file or of a class.
//   3. occurrences: every place the name stands as a whole word in the stripped code (so
//      refundPayment never matches refundPaymentLater), each a definition, an import, a call or
//      another use.
//
// No parser and no dependency: regular expressions on stripped lines. It is exact about words and
// about comments and strings, and approximate about the rest (a call through another object of
// the same method name is still a call); every line it lists comes with its text, so the reader
// can tell.

export type Lang = 'js' | 'py' | 'go' | 'rust' | 'c' | 'rb'

const BY_EXT: Record<string, Lang> = {
  ts: 'js', tsx: 'js', js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', mts: 'js', cts: 'js', vue: 'js', svelte: 'js',
  py: 'py', pyi: 'py',
  go: 'go',
  rs: 'rust',
  java: 'c', kt: 'c', kts: 'c', scala: 'c', cs: 'c', swift: 'c', c: 'c', h: 'c', cc: 'c', cpp: 'c', cxx: 'c', hpp: 'c',
  hh: 'c', m: 'c', mm: 'c', dart: 'c', php: 'c', groovy: 'c',
  rb: 'rb', rake: 'rb',
}

/** The language a path is written in, by its extension; null for anything that is not code here. */
export function langOf(path: string): Lang | null {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? BY_EXT[name.slice(dot + 1).toLowerCase()] ?? null : null
}

/** Code file extensions, for a ripgrep or git grep pathspec. */
export const CODE_EXTS = Object.keys(BY_EXT)

// ── stripping ────────────────────────────────────────────────────────────────

/**
 * The text with comments and the insides of strings blanked to spaces (newlines kept), so a line
 * keeps its number and its columns. Quotes stay, so `f("x")` still reads as a call.
 */
export function strip(text: string, lang: Lang): string {
  const out = text.split('')
  const n = text.length
  const blank = (from: number, to: number) => { for (let k = from; k < to && k < n; k++) if (out[k] !== '\n') out[k] = ' ' }
  const hashComments = lang === 'py' || lang === 'rb'
  const slashComments = lang !== 'py' && lang !== 'rb'
  // the open template literals' brace depths (JS): `${` opens code inside a template
  const templates: number[] = []
  let i = 0
  const quoted = (q: string, from: number, multiline: boolean): number => {
    let k = from
    while (k < n) {
      const c = text[k]!
      if (c === '\\' && q !== '`') { k += 2; continue }
      if (c === '\\' && q === '`' && lang === 'js') { k += 2; continue }
      if (text.startsWith(q, k)) return k
      if (c === '\n' && !multiline) return k
      k++
    }
    return n
  }
  while (i < n) {
    const c = text[i]!
    if (templates.length && lang === 'js') {
      if (c === '{') { templates[templates.length - 1]!++; i++; continue }
      if (c === '}') {
        if (templates[templates.length - 1] === 0) {
          templates.pop()
          // back inside the template: blank up to its end or the next ${
          i = template(i + 1)
          continue
        }
        templates[templates.length - 1]!--
        i++
        continue
      }
    }
    if (slashComments && c === '/' && text[i + 1] === '/') { const end = text.indexOf('\n', i); blank(i, end < 0 ? n : end); i = end < 0 ? n : end; continue }
    if (slashComments && c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); const to = end < 0 ? n : end + 2; blank(i, to); i = to; continue }
    if (hashComments && c === '#') {
      if (lang === 'rb' && text.startsWith('#{', i)) { i++; continue }
      const end = text.indexOf('\n', i); blank(i, end < 0 ? n : end); i = end < 0 ? n : end; continue
    }
    if (lang === 'rb' && c === '=' && text.startsWith('=begin', i) && (i === 0 || text[i - 1] === '\n')) {
      const end = text.indexOf('\n=end', i); const to = end < 0 ? n : end + 5; blank(i, to); i = to; continue
    }
    if (lang === 'py' && (text.startsWith('"""', i) || text.startsWith("'''", i))) {
      const q = text.slice(i, i + 3)
      const end = quoted(q, i + 3, true)
      blank(i + 3, end); i = Math.min(n, end + 3); continue
    }
    if (lang === 'rust' && c === 'r' && /^r#*"/.test(text.slice(i, i + 10)) && !/[\w]/.test(text[i - 1] ?? '')) {
      const hashes = /^r(#*)"/.exec(text.slice(i, i + 10))![1]!
      const close = `"${hashes}`
      const start = i + 2 + hashes.length
      const end = text.indexOf(close, start)
      const to = end < 0 ? n : end
      blank(start, to); i = Math.min(n, to + close.length); continue
    }
    if (c === '"' || c === "'" || c === '`') {
      if (c === "'" && lang === 'rust' && !/^'(\\.[^']*|[^\\'\n])'/.test(text.slice(i, i + 12))) { i++; continue } // a lifetime
      if (c === '`' && lang !== 'js' && lang !== 'go') { i++; continue }
      if (c === '`' && lang === 'js') { i = template(i + 1); continue }
      const end = quoted(c, i + 1, c === '`')
      blank(i + 1, end); i = end < n && text[end] === c ? end + 1 : end; continue
    }
    i++
  }
  return out.join('')

  // inside a JS template literal from `from`: blank to its closing backtick, or stop at `${`
  function template(from: number): number {
    let k = from
    while (k < n) {
      const ch = text[k]!
      if (ch === '\\') { blank(k, k + 2); k += 2; continue }
      if (ch === '`') return k + 1
      if (ch === '$' && text[k + 1] === '{') { templates.push(0); return k + 2 }
      if (ch !== '\n') out[k] = ' '
      k++
    }
    return n
  }
}

// ── definitions ──────────────────────────────────────────────────────────────

export type Kind = 'function' | 'method' | 'class' | 'type' | 'variable' | 'field' | 'module'
export type Def = { name: string; line: number; kind: Kind }

const ID = '[A-Za-z_$][\\w$]*'
const PYID = '[A-Za-z_]\\w*'
const NOT_NAMES = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'else', 'do', 'try', 'with', 'new',
  'throw', 'typeof', 'await', 'yield', 'delete', 'case', 'super', 'this', 'import', 'export', 'from', 'constructor',
  'elif', 'except', 'lambda', 'not', 'and', 'or', 'in', 'is', 'pass', 'raise', 'assert', 'del', 'global', 'nonlocal',
  'match', 'synchronized', 'using', 'lock', 'foreach', 'sizeof', 'defer', 'go', 'select', 'loop', 'unless', 'until'])

const JS: [RegExp, Kind][] = [
  [new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:async\\s+)?function\\s*\\*?\\s*(${ID})`), 'function'],
  [new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:abstract\\s+)?class\\s+(${ID})`), 'class'],
  [new RegExp(`^\\s*(?:export\\s+)?(?:declare\\s+)?(?:const\\s+)?(?:interface|type|enum|namespace|module)\\s+(${ID})`), 'type'],
  [new RegExp(`^\\s*(?:export\\s+)?(?:declare\\s+)?(?:const|let|var)\\s+(${ID})\\s*(?::[^=]*)?=\\s*(?:async\\s+)?(?:function\\b|\\([^()]*\\)\\s*(?::[^=]*)?=>|${ID}\\s*=>)`), 'function'],
  [new RegExp(`^\\s*(?:export\\s+)?(?:declare\\s+)?(?:const|let|var)\\s+(${ID})\\s*[:=]`), 'variable'],
  // a class member or object method: name(params) {   (and its modifiers)
  [new RegExp(`^\\s*(?:(?:public|private|protected|static|async|readonly|override|abstract|get|set|declare)\\s+)*\\*?\\s*(?:#)?(${ID})\\s*(?:<[^>]*>)?\\s*\\([^()]*\\)\\s*(?::[^={]*)?\\{\\s*$`), 'method'],
  // a class field or object property holding a function: name = (…) =>, name: async function
  [new RegExp(`^\\s*(?:(?:public|private|protected|static|readonly|override)\\s+)*(${ID})\\s*(?::[^=]*)?=\\s*(?:async\\s+)?(?:\\([^()]*\\)|${ID})\\s*(?::[^=]*)?=>`), 'method'],
  [new RegExp(`^\\s*(${ID})\\s*:\\s*(?:async\\s+)?(?:function\\b|\\([^()]*\\)\\s*=>)`), 'method'],
]

const GO: [RegExp, Kind][] = [
  [new RegExp(`^func\\s+\\([^)]*\\)\\s*(${ID})\\s*[[(]`), 'method'],
  [new RegExp(`^func\\s+(${ID})\\s*[[(]`), 'function'],
  [new RegExp(`^\\s*type\\s+(${ID})\\b`), 'type'],
  [new RegExp(`^(?:var|const)\\s+(${ID})\\b`), 'variable'],
]

const RUST: [RegExp, Kind][] = [
  [new RegExp(`^\\s*(?:pub(?:\\([^)]*\\))?\\s+)?(?:(?:default|async|const|unsafe|extern(?:\\s+"[^"]*")?)\\s+)*fn\\s+(${ID})`), 'function'],
  [new RegExp(`^\\s*(?:pub(?:\\([^)]*\\))?\\s+)?(?:struct|enum|trait|type|union)\\s+(${ID})`), 'type'],
  [new RegExp(`^\\s*(?:pub(?:\\([^)]*\\))?\\s+)?mod\\s+(${ID})`), 'module'],
  [new RegExp(`^\\s*(?:pub(?:\\([^)]*\\))?\\s+)?(?:const|static)\\s+(?:mut\\s+)?(${ID})\\s*:`), 'variable'],
  [new RegExp(`^\\s*macro_rules!\\s+(${ID})`), 'function'],
]

const C_MODS = '(?:public|private|protected|internal|static|final|abstract|synchronized|native|virtual|override|async|sealed|extern|inline|const|unsafe|default|open|suspend|operator|infix|tailrec|data|inner|lateinit|fileprivate|mutating|class|func|fun)'
const C: [RegExp, Kind][] = [
  [new RegExp(`^\\s*(?:@\\w+\\s+)*(?:${C_MODS}\\s+)*(?:class|interface|enum|record|struct|object|protocol|trait|extension)\\s+(${ID})`), 'class'],
  [new RegExp(`^\\s*(?:@\\w+\\s+)*(?:${C_MODS}\\s+)*(?:fun|func|def)\\s+(?:<[^>]*>\\s*)?(?:${ID}\\.)?(${ID})`), 'function'],
  [new RegExp(`^\\s*(?:@\\w+\\s+)*(?:${C_MODS}\\s+)*(?:val|var|let|const)\\s+(${ID})\\s*[:=]`), 'variable'],
  [new RegExp(`^\\s*(?:${C_MODS}\\s+)*function\\s+&?(${ID})\\s*\\(`), 'function'], // PHP
  // Java, C#, C: [modifiers] Type name(params) [throws X] {    (a declaration ending in ; is left out)
  [new RegExp(`^\\s*(?:@\\w+(?:\\([^)]*\\))?\\s+)*(?:${C_MODS}\\s+)*(?:[\\w$<>\\[\\],.?*&:]+\\s+)+[*&]?(${ID})\\s*\\([^;{}]*\\)?\\s*(?:const\\s*)?(?:throws\\s+[\\w$., ]+)?\\s*\\{?\\s*$`), 'method'],
]

const RB: [RegExp, Kind][] = [
  [new RegExp(`^\\s*def\\s+(?:self\\.)?(${PYID}[?!=]?)`), 'method'],
  [new RegExp(`^\\s*(?:class|module)\\s+(?:${PYID}::)*(${PYID})`), 'class'],
  [new RegExp(`^\\s*([A-Z]\\w*)\\s*=[^=]`), 'variable'],
]

/** The definitions a file holds: its text stripped, line by line, per its language. */
export function definitions(text: string, lang: Lang): Def[] {
  const code = strip(text, lang).split('\n')
  return lang === 'py' ? pythonDefs(code) : lang === 'go' ? goDefs(code) : lineDefs(code, lang === 'js' ? JS : lang === 'rust' ? RUST : lang === 'rb' ? RB : C)
}

function lineDefs(code: readonly string[], rules: readonly [RegExp, Kind][]): Def[] {
  const out: Def[] = []
  code.forEach((line, i) => {
    for (const [pattern, kind] of rules) {
      const m = pattern.exec(line)
      if (m && !NOT_NAMES.has(m[1]!)) { out.push({ name: m[1]!, line: i + 1, kind }); break }
    }
  })
  return out
}

/** Python: def and class at any depth (a def inside a class is a method), and names assigned at the top of a module or a class. */
function pythonDefs(code: readonly string[]): Def[] {
  const out: Def[] = []
  const blocks: { indent: number; kind: 'class' | 'def' }[] = []
  let open = 0 // brackets still open from earlier lines: a continuation line defines nothing
  code.forEach((line, i) => {
    const continued = open > 0
    for (const ch of line) { if (ch === '(' || ch === '[' || ch === '{') open++; else if (ch === ')' || ch === ']' || ch === '}') open = Math.max(0, open - 1) }
    if (continued || !line.trim()) return
    const indent = line.length - line.trimStart().length
    while (blocks.length && blocks[blocks.length - 1]!.indent >= indent) blocks.pop()
    const inside = blocks[blocks.length - 1]?.kind
    let m = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/.exec(line)
    if (m) { out.push({ name: m[1]!, line: i + 1, kind: inside === 'class' ? 'method' : 'function' }); blocks.push({ indent, kind: 'def' }); return }
    m = /^\s*class\s+([A-Za-z_]\w*)/.exec(line)
    if (m) { out.push({ name: m[1]!, line: i + 1, kind: 'class' }); blocks.push({ indent, kind: 'class' }); return }
    if (inside === 'def') return
    // NAME = …, NAME: T = …, NAME: T (a class's annotated field), and a, b = … at the top
    m = /^\s*([A-Za-z_]\w*)\s*(?::\s*[^=]+)?=(?!=)/.exec(line) ?? (inside === 'class' ? /^\s*([A-Za-z_]\w*)\s*:\s*[^=]+$/.exec(line) : null)
    if (m && !NOT_NAMES.has(m[1]!) && !/^\s*(?:else|try|finally)\s*:/.test(line)) out.push({ name: m[1]!, line: i + 1, kind: inside === 'class' ? 'field' : 'variable' })
  })
  return out
}

/** Go: funcs, methods, types and package-level names, inside `type (`, `var (` and `const (` blocks too. */
function goDefs(code: readonly string[]): Def[] {
  const out = lineDefs(code, GO)
  let block: Kind | null = null
  code.forEach((line, i) => {
    if (block) {
      if (/^\)/.test(line)) { block = null; return }
      const m = new RegExp(`^\\s+(${ID})\\b`).exec(line)
      if (m && !NOT_NAMES.has(m[1]!)) out.push({ name: m[1]!, line: i + 1, kind: block })
      return
    }
    const opened = /^(type|var|const)\s*\(\s*$/.exec(line)
    if (opened) block = opened[1] === 'type' ? 'type' : 'variable'
  })
  return out.sort((a, b) => a.line - b.line)
}

// ── occurrences ──────────────────────────────────────────────────────────────

export type Role = 'definition' | 'import' | 'call' | 'use'
export type Occurrence = { line: number; role: Role; kind?: Kind; member: boolean }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whether `name` is a plain identifier the symbol lookup can take. */
export function isIdentifier(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name) && name.length <= 200
}

/**
 * Every place `name` stands as a whole word in the file's code (never in a comment or a string,
 * never as part of a longer name), one per line, as a definition, an import, a call or a use.
 * A keyword argument of the same name (`f(name=1)` in Python) is not the symbol and is left out.
 */
export function occurrences(text: string, lang: Lang, name: string): Occurrence[] {
  const code = strip(text, lang).split('\n')
  const defs = new Map(definitions(text, lang).filter(d => d.name === name).map(d => [d.line, d.kind]))
  const word = new RegExp(`(^|[^\\w$])(${escape(name)})(?![\\w$])`, 'g')
  const imports = importLines(code, lang)
  const out: Occurrence[] = []
  code.forEach((line, i) => {
    const n = i + 1
    word.lastIndex = 0
    let role: Role | null = null
    let member = false
    for (let m = word.exec(line); m; m = word.exec(line)) {
      const at = m.index + m[1]!.length
      const after = line.slice(at + name.length)
      const before = line.slice(0, at)
      if (lang === 'py' && /^\s*=(?!=)/.test(after) && /[(,]\s*$/.test(before)) continue // a keyword argument
      const dotted = /(?:\.|->|::|\?\.)\s*$/.test(before)
      const here: Role = defs.has(n) ? 'definition' : imports.has(n) ? 'import'
        : /^\s*(?:<[^<>()]*>\s*)?(?:\?\.)?\(/.test(after) || /\bnew\s+$/.test(before) ? 'call' : 'use'
      // a line with several: the strongest role counts (definition, import, call, use)
      if (role === null || ORDER[here] < ORDER[role]) { role = here; member = dotted }
    }
    if (role) out.push({ line: n, role, ...(role === 'definition' ? { kind: defs.get(n)! } : {}), member })
  })
  return out
}

const ORDER: Record<Role, number> = { definition: 0, import: 1, call: 2, use: 3 }

/** The lines that belong to an import statement, multi-line ones whole. */
export function importLines(code: readonly string[], lang: Lang): Set<number> {
  const out = new Set<number>()
  const start = lang === 'js' ? /^\s*(?:import\b|export\s+(?:type\s+)?(?:\*|\{[^}]*\}?)\s*(?:from\b|$)|export\s*\{)|\brequire\s*\(/
    : lang === 'py' ? /^\s*(?:from\s+\S+\s+)?import\b/
      : lang === 'go' ? /^\s*import\b/
        : lang === 'rust' ? /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:use|extern\s+crate)\b/
          : lang === 'rb' ? /^\s*(?:require|require_relative|include|extend)\b/
            : /^\s*(?:import|using|#\s*include|use)\b/
  let open = false
  code.forEach((line, i) => {
    if (open) {
      out.add(i + 1)
      if (/[)}]|;\s*$/.test(line) || (lang === 'js' && /\bfrom\b/.test(line))) open = false
      return
    }
    if (!start.test(line)) return
    out.add(i + 1)
    const opens = (line.match(/[({]/g) ?? []).length
    const closes = (line.match(/[)}]/g) ?? []).length
    if (opens > closes || (lang === 'js' && /^\s*import\s*(?:type\s*)?\{[^}]*$/.test(line))) open = true
  })
  return out
}

/** Whether a path looks like a test (a tests/ folder, test_x.py, x.test.ts, x_spec.rb, x_test.go). */
export function isTestPath(path: string): boolean {
  return /(^|\/)(tests?|__tests__|spec|specs|testing)\//.test(path) || /(^|\/)test_[^/]*$|[._-](test|spec)s?\.[^/.]+$|_test\.go$/.test(path)
}

// ── names alike ──────────────────────────────────────────────────────────────

/** A name as lowercase letters and digits only: refundPayment, refund_payment and REFUND_PAYMENT agree. */
export function normal(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Whether `other` is a name like `name` without being it: the same name in another case style
 * (refund_payment for refundPayment), or one that holds it as a part (refundPaymentLater).
 */
export function alike(name: string, other: string): boolean {
  if (name === other) return false
  const a = normal(name)
  const b = normal(other)
  return a.length >= 4 && b.length >= 4 && (a === b || b.includes(a))
}
