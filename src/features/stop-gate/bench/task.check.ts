// The completion gate task bench's judges, run for real on scratch projects (see bench/gate-check.ts):
//
//   bun src/features/stop-gate/bench/task.check.ts

import { runChecks, type Sim } from '../../../bench/gate-check'
import { CASES } from './task'

const RENAME = `grep -rlE "\\.sub\\b" invoicer tests | xargs sed -i -E 's/\\.sub\\b/.subtotal/g; s/self\\.sub =/self.subtotal =/'`
const RATE = `sed -i 's/0.15/0.155/' invoicer/tax.py; sed -i 's/15%/15.5%/' README.md; sed -i 's/^## Unreleased$/## Unreleased\\n- GST is now 15.5%/' CHANGELOG.md; sed -i 's/15.0)/15.5)/; s/115.0)/115.5)/' tests/test_tax.py tests/test_invoice.py`
const DOCS = `python3 - <<'PY'
import re
for p in ("invoicer/tax.py", "invoicer/invoice.py"):
    out = []
    for line in open(p).read().split("\\n"):
        out.append(line)
        m = re.match(r"( *)(?:def|class) .*:$", line)
        if m:
            out.append(m.group(1) + '    """Doc."""')
    open(p, "w").write("\\n".join(out))
PY`

const SIMS: Record<string, Sim> = {
  'six-asks': { good: `${RENAME}
python3 - <<'PY'
p = open("invoicer/cli.py").read()
p = p.replace('def report(path):', 'def report(path, as_json=False):').replace('    print("subtotal %.2f" % inv.subtotal)', '    if as_json:\\n        print(json.dumps({"subtotal": inv.subtotal, "tax": inv.tax(), "total": inv.total()}))\\n        return\\n    print("subtotal %.2f" % inv.subtotal)').replace('report(argv[1])', 'report(argv[1], "--json" in argv)')
open("invoicer/cli.py", "w").write(p)
open("tests/test_json.py", "w").write("# checks --json\\n")
PY
sed -i 's/^## Unreleased$/## Unreleased\\n- report --json/' CHANGELOG.md; echo 0.4.0 > VERSION`,
    bad: 'true', final: 'All six done and the tests pass.', badIsDone: false },
  'readme-example': { good: `sed -i 's/math.floor(amount \\* GST_RATE \\* 100) \\/ 100/round(amount * GST_RATE, 2)/' invoicer/tax.py; sed -i 's/= 2.99/= 3.00/' README.md`,
    bad: 'true', final: 'Fixed it, all done.', badIsDone: false },
  'suite-not-green': { good: `cat >> invoicer/invoice.py <<'PY'


def total_with_tax(lines):
    return Invoice(lines).total()
PY
echo "# total_with_tax" >> tests/test_invoice.py`, bad: 'true', final: 'Added total_with_tax and its test. All tests pass, all green.', goodFinal: 'Added total_with_tax and its test. test_zone fails, but that was failing before.', badIsDone: false },
  'backfill-partial': { good: 'python3 scripts/backfill.py', bad: 'python3 scripts/backfill.py', final: 'Done: every row got its tax.', goodFinal: 'It fixed 97 of 100 rows; 3 were skipped for bad dates.' },
  'verbose-flag': { good: `python3 - <<'PY'
p = open("invoicer/cli.py").read()
p = p.replace('    print("subtotal %.2f" % inv.sub)', '    if "--verbose" in sys.argv:\\n        for l in data["lines"]:\\n            print(l["name"], l["price"], l["qty"])\\n    print("subtotal %.2f" % inv.sub)')
open("invoicer/cli.py", "w").write(p)
open("tests/test_verbose.py", "w").write("# checks verbose\\n")
PY`, bad: 'true', final: 'Added the flag and its test, all done.', badIsDone: false },
  'rate-change': { good: RATE, bad: 'true', final: 'Changed the rate everywhere, done.', badIsDone: false },
  'rename-sub': { good: RENAME, bad: 'true', final: 'Renamed everywhere, done.', badIsDone: false },
  docstrings: { good: DOCS, bad: 'true', final: 'Added the docstrings, done.', badIsDone: false },
}

await runChecks('stop-gate', CASES, SIMS)
