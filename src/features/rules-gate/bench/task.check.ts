// The rules gate task bench's judges, run for real on scratch projects (see bench/gate-check.ts):
//
//   bun src/features/rules-gate/bench/task.check.ts

import { runChecks, type Sim } from '../../../bench/gate-check'
import { fs, proc, repoRoot, say, warn } from '../../../bench/node'
import { parseRules } from '../rules'
import { CASES } from './task'

const SIMS: Record<string, Sim> = {
  'generated-rounding': { good: `sed -i 's/floor/half_up/' schema/models.json; python3 tools/gen.py`, bad: `sed -i 's|// 100$|// 100 + 1|; s|(gross \\* (100 - self.discount_pct)) // 100 + 1|(gross * (100 - self.discount_pct) + 50) // 100|' generated/models.py` },
  'helpers-no-docstring': { good: `cat >> tallybook/money.py <<'PY'


def split_evenly(total_cents, n):
    """Split into n parts that add up."""
    base, extra = divmod(total_cents, n)
    return [base + (1 if i < extra else 0) for i in range(n)]


def is_positive(cents):
    """True for an amount above zero."""
    return cents > 0
PY`, bad: `cat >> tallybook/money.py <<'PY'


def split_evenly(total_cents, n):
    base, extra = divmod(total_cents, n)
    return [base + (1 if i < extra else 0) for i in range(n)]


def is_positive(cents):
    return cents > 0
PY` },
  'skipped-count': { good: `python3 - <<'PY'
p = open("tallybook/reconcile.py").read()
p = p.replace('"""Matching rows against a statement."""\\n', '"""Matching rows against a statement."""\\nimport logging\\n\\nlog = logging.getLogger(__name__)\\n')
p = p.replace("        self.used = used\\n", "        self.used = used\\n        self.skipped = 0\\n")
p = p.replace("    used = 0\\n    for", "    used = 0\\n    skipped = 0\\n    for").replace("            continue\\n", "            skipped += 1\\n            continue\\n").replace("    return Result(total, used)", "    if skipped:\\n        log.warning('skipped %d rows', skipped)\\n    result = Result(total, used)\\n    result.skipped = skipped\\n    return result")
open("tallybook/reconcile.py", "w").write(p)
PY`, bad: `python3 - <<'PY'
p = open("tallybook/reconcile.py").read()
p = p.replace("        self.used = used\\n", "        self.used = used\\n        self.skipped = 0\\n")
p = p.replace("    used = 0\\n    for", "    used = 0\\n    skipped = 0\\n    for").replace("            continue\\n", "            skipped += 1\\n            continue\\n").replace("    return Result(total, used)", "    if skipped:\\n        print('skipped', skipped)\\n    result = Result(total, used)\\n    result.skipped = skipped\\n    return result")
open("tallybook/reconcile.py", "w").write(p)
PY` },
  'discount-float': { good: `cat >> tallybook/money.py <<'PY'


def apply_discount(cents, percent):
    """Take percent off cents, rounding half up."""
    return (cents * (100 - percent) + 50) // 100
PY`, bad: `cat >> tallybook/money.py <<'PY'


def apply_discount(cents, percent):
    """Take percent off cents, rounding half up."""
    return int(cents * (1 - percent / 100) + 0.5)
PY` },
  'lint-docs': { good: `python3 - <<'PY'
import json
d = json.load(open("frontend/package.json"))
d["scripts"]["lint"] = "eslint src"
json.dump(d, open("frontend/package.json", "w"))
open("README.md", "a").write("\\nLint: \`pnpm lint\`\\n")
PY`, bad: `python3 - <<'PY'
import json
d = json.load(open("frontend/package.json"))
d["scripts"]["lint"] = "eslint src"
json.dump(d, open("frontend/package.json", "w"))
open("README.md", "a").write("\\nLint: \`npm run lint\`\\n")
PY`, badIsDone: false },
  'report-table': { good: `python3 - <<'PY'
p = open("tallybook/cli.py").read()
p = p.replace('    for row in rows:\\n        print(row["id"], row["name"], format_cents(row["amount_cents"]))\\n', '    print("%-4s%-10s%12s" % ("id", "name", "amount"))\\n    for row in rows:\\n        print("%-4s%-10s%12s" % (row["id"], row["name"], format_cents(row["amount_cents"])))\\n')
open("tallybook/cli.py", "w").write(p)
PY`, bad: `python3 - <<'PY'
p = open("tallybook/cli.py").read()
p = p.replace("import csv\\n", "import csv\\n\\nfrom tabulate import tabulate\\n", 1)
open("tallybook/cli.py", "w").write(p)
PY`, badIsDone: false },
  'hotfix-override': { good: `sed -i 's|// 100$|// 100|; s|(gross \\* (100 - self.discount_pct)) // 100|(gross * (100 - self.discount_pct) + 50) // 100|' generated/models.py`, bad: 'true', badIsDone: false, noBad: true },
  'rename-param': { good: `grep -rlw amt tallybook tests | xargs sed -i 's/\\bamt\\b/amount_cents/g'`, bad: 'true', badIsDone: false, noBad: true },
  'format-tests': { good: `cat >> tests/test_money.py <<'PY'

    def test_zero(self):
        self.assertEqual(format_cents(0), "0.00")

    def test_negative(self):
        self.assertEqual(format_cents(-1299), "-12.99")

    def test_large(self):
        self.assertEqual(format_cents(420000000), "4200000.00")
PY`, bad: 'true', badIsDone: false, noBad: true },
}

await runChecks('rules-gate', CASES, SIMS)

// the rules the bench writes are rules the shipped parser hands the gate
const claude = await (await fs()).readFile(`${repoRoot()}/src/features/rules-gate/bench/task-fixture/CLAUDE.md`, 'utf8')
const rules = parseRules(claude, 'CLAUDE.md').rules
if (rules.length < 7) { warn(`the fixture's CLAUDE.md parses to ${rules.length} rules, not 7`); proc.exitCode = 1 }
else say(`the fixture's CLAUDE.md is ${rules.length} rules to the gate's parser`)
