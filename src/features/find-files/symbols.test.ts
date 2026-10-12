import { test, expect } from 'claude-code/testing'
import { alike, definitions, importLines, isIdentifier, langOf, normal, occurrences, strip } from './symbols'

// The symbol rules, held to their word: comments and strings never count, a longer name never
// matches, and each language's definitions are found where they are.

const TS = `// refundPayment refunds a payment
import { refundPayment, other } from './refunds'
import {
  refundPaymentLater,
  refundPayment as rp,
} from './later'
export async function refundPayment(id: string) {
  const s = "refundPayment"
  const t = \`calls \${refundPayment(1)} and refundPayment\`
  /* refundPayment */ await refundPayment(id)
  obj.refundPayment(2)
  refundPaymentLater(3)
  return refundPayment
}
class Refunds {
  async refundPayment(x: number) {
  }
  handler = async (e: Event) => { }
}
export const MAX_REFUND = 100
export type RefundId = string
`

test('languages by extension; anything else is not code here', () => {
  expect(langOf('src/a.ts')).toBe('js')
  expect(langOf('a/b.py')).toBe('py')
  expect(langOf('main.go')).toBe('go')
  expect(langOf('lib.rs')).toBe('rust')
  expect(langOf('A.java')).toBe('c')
  expect(langOf('x.rb')).toBe('rb')
  expect(langOf('README.md')).toBe(null)
  expect(langOf('Makefile')).toBe(null)
  expect(langOf('migrations/0001.sql')).toBe(null)
})

test('strip: comments and the insides of strings become spaces; lines and columns stay', () => {
  const out = strip(TS, 'js')
  expect(out.length).toBe(TS.length)
  expect(out.split('\n').length).toBe(TS.split('\n').length)
  expect(out.split('\n')[0]!.trim()).toBe('')
  expect(out.split('\n')[7]).toBe('  const s = "             "')
  // a template literal's text is blanked, the code inside ${} is kept
  expect(out.split('\n')[8]).toContain('${refundPayment(1)}')
  expect(out.split('\n')[8]).not.toContain('and refundPayment')
  expect(out.split('\n')[9]).toBe('                      await refundPayment(id)')
  expect(strip('x = "a # b"  # note\ny = """doc\nrefund"""\n', 'py')).toBe('x = "     "        \ny = """   \n      """\n')
  expect(strip('let c = \'x\'; fn f<\'a>(s: &\'a str) { r#"q"# }', 'rust')).toBe('let c = \' \'; fn f<\'a>(s: &\'a str) { r#" "# }')
  expect(strip('s := `raw // not a comment`\n// gone', 'go')).toBe(`s := \`${' '.repeat(20)}\`\n${' '.repeat(7)}`)
  expect(strip('puts "x" # c\n=begin\nhidden\n=end\nok', 'rb')).toBe('puts " "    \n      \n      \n    \nok')
})

test('TS/JS definitions: functions, classes, methods, arrow fields, types, constants', () => {
  const defs = definitions(TS, 'js').map(d => `${d.name}:${d.line}:${d.kind}`)
  expect(defs).toContain('refundPayment:7:function')
  expect(defs).toContain('Refunds:15:class')
  expect(defs).toContain('refundPayment:16:method')
  expect(defs).toContain('handler:18:method')
  expect(defs).toContain('MAX_REFUND:20:variable')
  expect(defs).toContain('RefundId:21:type')
  // calls, control flow and nested callbacks are not definitions
  const calls = definitions('  if (x) {\n  foo(a, function () {\n  describe("x", () => {\n  app.get(a) {\n', 'js')
  expect(calls).toEqual([])
})

test('Python: functions, methods, classes, module and class-level names; never a function\'s locals', () => {
  const py = `"""refund_payment lives here."""
import os
MAX = 3
class Order(models.Model):
    status = models.CharField(max_length=3)
    total: int
    def refund_payment(self, refund_payment=None):
        x = refund_payment
        return self.refund_payment(refund_payment=1)
def helper(a,
           b=2):
    local = 1
async def fetch():
    pass
`
  expect(definitions(py, 'py').map(d => `${d.name}:${d.line}:${d.kind}`)).toEqual([
    'MAX:3:variable', 'Order:4:class', 'status:5:field', 'total:6:field', 'refund_payment:7:method', 'helper:10:function', 'fetch:13:function'])
  const seen = occurrences(py, 'py', 'refund_payment')
  // the docstring and the keyword arguments are not the symbol; the parameter's line is the definition's
  expect(seen.map(o => `${o.line}:${o.role}${o.member ? ':member' : ''}`)).toEqual(['7:definition', '8:use', '9:call:member'])
})

test('Go, Rust, Java and Ruby definitions', () => {
  const go = 'package x\nfunc (s *Server) Serve(a int) error { return nil }\nfunc New() *Server {}\ntype (\n  Server struct{}\n  ID int\n)\nconst (\n  Max = 1\n)\nvar Default = New()\n'
  expect(definitions(go, 'go').map(d => `${d.name}:${d.kind}`)).toEqual(['Serve:method', 'New:function', 'Server:type', 'ID:type', 'Max:variable', 'Default:variable'])
  const rs = 'pub struct Pool;\nimpl Pool {\n    pub async fn acquire(&self) {}\n}\nconst LIMIT: u32 = 3;\nmacro_rules! log_it { () => {} }\npub(crate) mod inner {}\n'
  expect(definitions(rs, 'rust').map(d => `${d.name}:${d.kind}`)).toEqual(['Pool:type', 'acquire:function', 'LIMIT:variable', 'log_it:function', 'inner:module'])
  const java = 'public class Refunds {\n  @Override\n  public static List<String> refund(int a, String b) throws IOException {\n    return refund(1, "x");\n  }\n  private void close() {\n}\n'
  expect(definitions(java, 'c').map(d => `${d.name}:${d.kind}`)).toEqual(['Refunds:class', 'refund:method', 'close:method'])
  expect(occurrences(java, 'c', 'refund').map(o => o.role)).toEqual(['definition', 'call'])
  const kt = 'data class Point(val x: Int)\nfun distance(a: Point): Double = 0.0\n'
  expect(definitions(kt, 'c').map(d => d.name)).toEqual(['Point', 'distance'])
  const rb = 'module Billing\n  class Refund\n    def self.call(x)\n    end\n    LIMIT = 3\n  end\nend\n'
  expect(definitions(rb, 'rb').map(d => `${d.name}:${d.kind}`)).toEqual(['Billing:class', 'Refund:class', 'call:method', 'LIMIT:variable'])
})

test('occurrences: whole words in code only, one per line, the strongest role', () => {
  const seen = occurrences(TS, 'js', 'refundPayment')
  expect(seen.map(o => `${o.line}:${o.role}`)).toEqual([
    '2:import', // import { refundPayment, other }
    '5:import', // inside a multi-line import
    '7:definition',
    '9:call', // inside ${...} of a template
    '10:call', // after a block comment
    '11:call',
    '13:use', // returned, not called
    '16:definition',
  ])
  expect(seen.find(o => o.line === 11)!.member).toBe(true)
  // the comment on line 1, the string on line 8 and refundPaymentLater on lines 4 and 12 never count
  expect(seen.some(o => [1, 4, 8, 12].includes(o.line))).toBe(false)
  expect(occurrences(TS, 'js', 'refundPaymentLater').map(o => o.line)).toEqual([4, 12])
  // new X() is a call
  expect(occurrences('const r = new Refunds()\n', 'js', 'Refunds')[0]!.role).toBe('call')
})

test('import lines, multi-line ones whole', () => {
  const code = strip("import a from 'a'\nimport {\n  b,\n  c,\n} from 'b'\nconst x = require('x')\nfoo()\n", 'js').split('\n')
  expect([...importLines(code, 'js')]).toEqual([1, 2, 3, 4, 5, 6])
  const py = strip('from a import (\n    b,\n)\nimport os\nx = 1\n', 'py').split('\n')
  expect([...importLines(py, 'py')]).toEqual([1, 2, 3, 4])
})

test('names alike: another case style, or a longer name holding it; never itself, never short', () => {
  expect(normal('refund_payment')).toBe(normal('refundPayment'))
  expect(alike('refundPayment', 'refund_payment')).toBe(true)
  expect(alike('refundPayment', 'refundPaymentLater')).toBe(true)
  expect(alike('refundPayment', 'refundPayment')).toBe(false)
  expect(alike('refundPayment', 'refund')).toBe(false)
  expect(alike('id', 'userId')).toBe(false)
  expect(isIdentifier('refund_payment')).toBe(true)
  expect(isIdentifier('$el')).toBe(true)
  expect(isIdentifier('two words')).toBe(false)
  expect(isIdentifier('a.b')).toBe(false)
})
