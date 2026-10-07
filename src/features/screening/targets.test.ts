import { test, expect } from 'claude-code/testing'
import { isNetworkCommand, kindOf, screenValue } from './targets'


test('Bash output is screened when the command fetches from the network', () => {
  for (const c of ['curl -s https://x.example', 'wget -qO- https://x', 'cd /tmp && curl x', 'gh api repos/a/b',
                   'sudo curl x', 'echo $(curl -s x)', 'xh GET x.example', 'https example.org'])
    expect(isNetworkCommand(c)).toBe(true)
  for (const c of ['git status', 'ls -la', 'grep curl notes.txt', 'python3 -m pytest', 'cat curl.md', 'echo "use wget"'])
    expect(isNetworkCommand(c)).toBe(false)
})

test('screenValue screens each long text of a result, in place, within a budget', async () => {
  const long = 'x'.repeat(250)
  const seen: string[] = []
  const screen = async (text: string) => { seen.push(text); return { text: '[withheld]', flagged: 1 } }
  const budget = { left: 2, withheld: 0 }
  const out = await screenValue({ content: [{ type: 'text', text: long }, { type: 'image' }, { type: 'text', text: 'short' },
                                            { type: 'text', text: long }, { type: 'text', text: long }] }, screen, budget)
  expect((out as any).content.map((b: any) => b.text ?? b.type)).toEqual(['[withheld]', 'image', 'short', '[withheld]', long])
  expect(budget).toEqual({ left: 0, withheld: 2 })
  expect(seen.length).toBe(2)
})

test('kindOf picks the web tools, every MCP tool, and network commands only', () => {
  expect(kindOf('WebFetch', {})).toBe('WebFetch')
  expect(kindOf('mcp__claude_ai_Gmail__get_thread', {})).toBe('mcp')
  expect(kindOf('Bash', { command: 'curl -s https://x' })).toBe('bash')
  expect(kindOf('Bash', { command: 'git status' })).toBe(null)
  expect(kindOf('Read', { file_path: '/x' })).toBe(null)
})
