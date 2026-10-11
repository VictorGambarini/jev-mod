"""The compact task bench fixture's bulk files (the CI log, the app log, the August invoices and the
changelog), deterministically: python3 src/features/compact/bench/task-fixture-gen.py src/features/compact/bench/task-fixture"""
import random
import sys
from datetime import date, datetime, timedelta

root = sys.argv[1]
R = random.Random(20261011)

FIRST = ["Kowhai", "Harbour", "Pohutukawa", "Southern", "Riverbend", "Totara", "Coastline", "Ironsand", "Kereru", "Matai",
         "Rimu", "Summit", "Bluegum", "Wattle", "Brightwater", "Northshore", "Kahikatea", "Tasman", "Redfern", "Wharf"]
SECOND = ["Labs", "Studio", "Analytics", "Consulting", "Freight", "Dental", "Physio", "Bakery", "Accounting", "Design",
          "Logistics", "Ventures", "Health", "Legal", "Media", "Engineering", "Coffee", "Builders", "Partners", "Systems"]
MACRON = ["Tāne Mahuta Ltd", "Mātai Health", "Kōwhai & Rātā Design", "Pōhutukawa Coast Motel", "Ōtautahi Freight",
          "Whānau Dental", "Tūī Valley Orchards", "Rūaumoko Engineering", "Kākāpō Software", "Māhina Physio",
          "Te Āra Consulting", "Hōkioi Logistics"]
COMMA = ["Smith, Tane & Co", "Ngata, Hughes and Partners", "Brown, Patel Accounting", "Lee, Walker & Fifita"]
PLANS = {"starter": 4900, "growth": 12900, "scale": 34900}


def half_up(n, d):
    q, r = divmod(abs(n), d)
    if 2 * r >= d:
        q += 1
    return q if n >= 0 else -q


def customers():
    out = []
    names = set()
    for i in range(640):
        cid = f"C-{10100 + i * 3 + R.randint(0, 2)}"
        roll = R.random()
        if roll < 0.06 and len([c for c in out if c[1] in MACRON]) < len(MACRON):
            name = [m for m in MACRON if m not in names][0]
        elif roll < 0.075 and len([c for c in out if c[1] in COMMA]) < len(COMMA):
            name = [m for m in COMMA if m not in names][0]
        else:
            name = f"{R.choice(FIRST)} {R.choice(SECOND)}"
            while name in names:
                name = f"{R.choice(FIRST)} {R.choice(SECOND)} {R.choice(['NZ', 'Ltd', 'Group', 'Co'])}"
        names.add(name)
        region = "AU" if R.random() < 0.22 else "NZ"
        plan = R.choices(list(PLANS), [5, 4, 1])[0]
        out.append((cid, name, region, plan))
    # the customer from BIL-231
    out[137] = ("C-10482", "Brightwater Physio", "NZ", "starter")
    for m in MACRON:
        if m not in names:
            k = R.randrange(len(out))
            out[k] = (out[k][0], m, out[k][2], out[k][3])
    return out


CUST = customers()
GST = {"NZ": (15, 100), "AU": (10, 100)}


def csv_field(s):
    return f'"{s}"' if "," in s or '"' in s else s


def invoices_csv():
    lines = ["invoice_number,customer_id,customer_name,region,plan,period_start,period_end,net_cents,gst_cents,total_cents,status,notes"]
    n = 48211
    refunds = 0
    for cid, name, region, plan in CUST:
        net = PLANS[plan]
        notes = ""
        new_plan = plan
        if cid == "C-10482":
            new_plan = "growth"
            net = PLANS["starter"] + 4000
            notes = "upgrade starter->growth 2026-08-17; proration line 4000"
        elif R.random() < 0.035 and plan != "scale":
            new_plan = "growth" if plan == "starter" else "scale"
            day = R.randint(3, 27)
            left = 31 - day + 1
            pr = int(PLANS[new_plan] * left / 30) - int(PLANS[plan] * left / 30)
            net += pr
            notes = f"upgrade {plan}->{new_plan} 2026-08-{day:02d}; proration line {pr}"
        status = R.choices(["paid", "open", "void"], [90, 8, 2])[0]
        if status == "paid" and R.random() < 0.028:
            refunds += 1
            amount = R.choice([1000, 2500, 4900, 6450, 1290])
            notes = (notes + "; " if notes else "") + f"refund partial {amount} on 2026-08-{R.randint(5, 30):02d}"
        if R.random() < 0.05:
            notes = (notes + "; " if notes else "") + R.choice(["coupon WINTER10", "coupon FRIENDS", "paid late", "card updated", "po ref required"])
        num, den = GST[region]
        gst = half_up(net * num, den)
        lines.append(",".join([f"INV-{n:06d}", cid, csv_field(name), region, new_plan, "2026-08-01", "2026-09-01",
                               str(net), str(gst), str(net + gst), status, csv_field(notes)]))
        n += R.randint(1, 3)
    return "\n".join(lines) + "\n", refunds


TESTS = [
    ("test_dunning", "DunningTest", ["test_retries_then_none", "test_schedule_from_config", "test_suspends_after_two_weeks"]),
    ("test_discounts", "CouponTest", ["test_a_coupon_is_one_kind", "test_amount_off_never_exceeds_the_lines", "test_one_coupon_only_the_best", "test_percent_off"]),
    ("test_export", "ExportTest", ["test_csv_escapes_commas_in_customer_names", "test_header_and_one_row"]),
    ("test_invoice", "BuildInvoiceTest", ["test_gst_after_a_negative_line", "test_gst_on_the_net_total", "test_numbers_follow_each_other", "test_refuses_empty_and_negative"]),
    ("test_invoice", "StatusTest", ["test_paid_then_refundable", "test_summary_is_plain_data"]),
    ("test_money", "AllocateTest", ["test_parts_add_up"]),
    ("test_money", "FmtTest", ["test_formats"]),
    ("test_money", "RoundHalfUpTest", ["test_below_half_goes_down", "test_halves_go_up", "test_halves_of_negatives_go_away_from_zero", "test_refuses_a_zero_denominator"]),
    ("test_money", "ToCentsTest", ["test_refuses_floats", "test_strings_and_decimals"]),
    ("test_proration", "HelpersTest", ["test_days_between", "test_proration_line"]),
    ("test_proration", "ProrateTest", ["test_exact_division", "test_full_cycle_is_the_whole_amount", "test_nothing_used_is_zero", "test_refuses_days_outside_the_cycle", "test_rounds_half_up", "test_rounds_half_up_on_odd_amounts"]),
    ("test_proration", "UpgradeChargeTest", ["test_change_on_the_first_day_of_a_31_day_cycle", "test_downgrade_is_a_credit", "test_refuses_a_change_outside_the_cycle", "test_upgrade_in_a_31_day_cycle", "test_upgrade_in_february"]),
    ("test_tax", "GstTest", ["test_gst_inside_a_gross_amount", "test_gst_on_a_net_amount", "test_nz_and_au_rates"]),
    ("test_webhooks", "EventTest", ["test_invoice_paid_shape"]),
    ("test_webhooks", "SignatureTest", ["test_rejects_a_malformed_header", "test_rejects_a_tampered_body", "test_rejects_an_old_delivery", "test_round_trip", "test_tolerates_whitespace_a_proxy_adds"]),
]
FAIL = {"test_csv_escapes_commas_in_customer_names": "FAIL", "test_rounds_half_up": "FAIL", "test_rounds_half_up_on_odd_amounts": "FAIL",
        "test_upgrade_in_a_31_day_cycle": "FAIL", "test_upgrade_in_february": "FAIL", "test_change_on_the_first_day_of_a_31_day_cycle": "ERROR"}
TRACE = {
    "test_csv_escapes_commas_in_customer_names": ("test_export.py", 24, 'self.assertEqual(rows[1][2], "Smith, Tane & Co")', "AssertionError: 'Smith' != 'Smith, Tane & Co'\n- Smith\n+ Smith, Tane & Co"),
    "test_rounds_half_up": ("test_proration.py", 23, "self.assertEqual(prorate(999, 15, 30), 500)", "AssertionError: 499 != 500"),
    "test_rounds_half_up_on_odd_amounts": ("test_proration.py", 27, "self.assertEqual(prorate(997, 15, 30), 499)", "AssertionError: 498 != 499"),
    "test_upgrade_in_a_31_day_cycle": ("test_proration.py", 41, "self.assertEqual(upgrade_charge(STARTER, GROWTH, date(2026, 10, 16), date(2026, 10, 1), date(2026, 11, 1)), 4129)", "AssertionError: 4267 != 4129"),
    "test_upgrade_in_february": ("test_proration.py", 45, "self.assertEqual(upgrade_charge(STARTER, GROWTH, date(2026, 2, 15), date(2026, 2, 1), date(2026, 3, 1)), 4000)", "AssertionError: 3734 != 4000"),
}


def ci_log():
    out = []
    t = datetime(2026, 10, 8, 13, 0, 4)

    def line(s, step=0.3):
        nonlocal t
        t += timedelta(seconds=R.random() * step)
        out.append(f"{t.strftime('%Y-%m-%dT%H:%M:%S')}.{R.randint(1000000, 9999999)}Z {s}")

    slow = {}
    for py in ["3.11.9", "3.12.6", "3.13.0"]:
        line(f"##[group]Run nightly / test (python {py})")
        line("Current runner version: '2.319.1'")
        line("Operating System: Ubuntu 24.04.1 LTS")
        line("Runner Image: ubuntu-24.04 Version: 20260929.1")
        for perm in ["Actions: write", "Checks: write", "Contents: read", "Metadata: read", "PullRequests: read", "Statuses: write"]:
            line(f"GITHUB_TOKEN Permissions {perm}")
        line("Secret source: Actions")
        line("Prepare workflow directory")
        line("Prepare all required actions")
        line("Getting action download info")
        line("Download action repository 'actions/checkout@v4' (SHA:11bd71901bbe5b1630ceea73d27597364c9af683)")
        line("Download action repository 'actions/setup-python@v5' (SHA:0b93645e9fea7318ecaed2b359559ac225c90a2b)")
        line("Download action repository 'actions/cache@v4' (SHA:6849a6489940f00c2f30c0fb92c6274307ccb58a)")
        line("##[endgroup]")
        line("##[group]Run actions/checkout@v4")
        for k in ["repository: tidewater/ledgerline", "ref: refs/heads/main", "fetch-depth: 1", "lfs: false", "submodules: false", "set-safe-directory: true"]:
            line(f"  {k}")
        line("Syncing repository: tidewater/ledgerline")
        line("Determining the checkout info")
        line("/usr/bin/git sparse-checkout disable")
        line("/usr/bin/git config --local --unset-all extensions.worktreeConfig")
        line("Checking out the ref")
        line("/usr/bin/git log -1 --format=%H")
        line("4e1c9b07d2a85f3f6c0e8a91b3d74f2a6c5e1d08")
        line("##[endgroup]")
        line(f"##[group]Run actions/setup-python@v5 (python-version: {py})")
        line(f"Successfully set up CPython ({py})")
        line("##[endgroup]")
        line("##[group]Run pip install --upgrade pip coverage ruff")
        for pkg, ver, size in [("pip", "24.2", "1.8"), ("coverage", "7.6.1", "0.2"), ("ruff", "0.6.9", "10.9")]:
            line(f"Collecting {pkg}")
            line(f"  Downloading {pkg}-{ver}-py3-none-any.whl.metadata ({R.randint(2, 30)}.{R.randint(0, 9)} kB)")
            line(f"  Downloading {pkg}-{ver}-py3-none-any.whl ({size} MB)")
            line(f"     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ {size}/{size} MB {R.randint(20, 90)}.{R.randint(0, 9)} MB/s eta 0:00:00")
        line("Installing collected packages: ruff, pip, coverage")
        line("Successfully installed coverage-7.6.1 pip-24.2 ruff-0.6.9")
        line("##[endgroup]")
        line("##[group]Run ruff check billing tests")
        line("All checks passed!")
        line("##[endgroup]")
        line("##[group]Run python -m compileall -q billing tests")
        line("##[endgroup]")
        line("##[group]Run coverage run -m unittest discover -s tests -t . -v")
        fails = []
        for mod, cls, names in TESTS:
            for name in names:
                ms = R.randint(1, 9) if R.random() < 0.85 else R.randint(40, 380)
                if mod == "test_export":
                    ms += 900 + R.randint(0, 600)  # builds the export fixtures from data/
                slow.setdefault(f"tests.{mod}.{cls}.{name}", []).append(ms)
                status = FAIL.get(name, "ok")
                line(f"{name} (tests.{mod}.{cls}.{name}) ... {status} ({ms / 1000:.3f}s)")
                if status != "ok":
                    fails.append((mod, cls, name, status))
                if mod == "test_dunning" and name == "test_schedule_from_config" and py == "3.12.6":
                    line("/home/runner/work/ledgerline/billing/dunning.py:12: ResourceWarning: unclosed file <_io.TextIOWrapper name='config/billing.json'>")
        for mod, cls, name, status in fails:
            line("=" * 70)
            line(f"{status}: {name} (tests.{mod}.{cls}.{name})")
            line("-" * 70)
            line("Traceback (most recent call last):")
            if name in TRACE:
                f, ln, src, err = TRACE[name]
                line(f'  File "/home/runner/work/ledgerline/ledgerline/tests/{f}", line {ln}, in {name}')
                line(f"    {src}")
                for e in err.split("\n"):
                    line(e)
            else:
                line('  File "/home/runner/work/ledgerline/ledgerline/tests/test_proration.py", line 48, in test_change_on_the_first_day_of_a_31_day_cycle')
                line("    self.assertEqual(upgrade_charge(STARTER, GROWTH, date(2026, 8, 1), date(2026, 8, 1), date(2026, 9, 1)), 8000)")
                line('  File "/home/runner/work/ledgerline/ledgerline/billing/proration.py", line 40, in upgrade_charge')
                line("    charge = prorate(new.price_cents, remaining, CYCLE_DAYS)")
                line('  File "/home/runner/work/ledgerline/ledgerline/billing/proration.py", line 30, in prorate')
                line('    raise ValueError("used_days is outside the cycle")')
                line("ValueError: used_days is outside the cycle")
            line("")
        line("-" * 70)
        line(f"Ran 46 tests in {R.randint(2, 4)}.{R.randint(100, 999)}s")
        line("")
        line("FAILED (failures=5, errors=1)")
        line("##[endgroup]")
        line("##[group]Run coverage report -m")
        line("Name                     Stmts   Miss  Cover   Missing")
        line("------------------------------------------------------")
        tot_s = tot_m = 0
        for m in ["__init__", "discounts", "dunning", "export", "invoice", "money", "plans", "proration", "sequence", "tax", "webhooks"]:
            s = R.randint(4, 60)
            mi = R.randint(0, max(0, s // 6))
            tot_s += s
            tot_m += mi
            missing = ", ".join(str(R.randint(10, 80)) for _ in range(mi))
            line(f"billing/{m + '.py':<18} {s:>5} {mi:>6} {100 * (s - mi) // s:>5}%   {missing}")
        line("------------------------------------------------------")
        line(f"TOTAL                    {tot_s:>5} {tot_m:>6} {100 * (tot_s - tot_m) // tot_s:>5}%")
        line("##[endgroup]")
        line("##[error]Process completed with exit code 1.")
        line("##[group]Run actions/upload-artifact@v4 (name: coverage-" + py + ")")
        line("With the provided path, there will be 1 file uploaded")
        line("Artifact name is valid!")
        line(f"Artifact coverage-{py}.zip successfully finalized. Artifact ID {R.randint(1900000000, 1999999999)}")
        line("##[endgroup]")
        line("Post job cleanup.")
        line("Cleaning up orphan processes")
    line("##[group]Slowest tests (mean of the matrix)")
    for name, v in sorted(slow.items(), key=lambda kv: -sum(kv[1]))[:10]:
        line(f"{sum(v) / len(v) / 1000:7.3f}s  {name}")
    line("##[endgroup]")
    line("##[group]Summary")
    line("nightly: 3 jobs, 3 failed. Failing on every Python: tests.test_export (1), tests.test_proration (5).")
    line("##[endgroup]")
    return "\n".join(out) + "\n", slow


def staging_log():
    out = []
    t = datetime(2026, 10, 6, 0, 0, 2)
    by_name = {c[0]: c for c in CUST}
    failed = []
    evt = lambda: "evt_" + "".join(R.choice("0123456789abcdef") for _ in range(12))
    req = lambda: "".join(R.choice("0123456789abcdef") for _ in range(8))
    partners = ["kauri-analytics", "harbourview-crm", "flaxroot-books"]
    inv = 51870
    while t < datetime(2026, 10, 10, 18, 0):
        t += timedelta(seconds=R.randint(90, 1700))
        ts = t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{R.randint(0, 999):03d}+13:00"
        roll = R.random()
        cid, name, region, plan = R.choice(CUST)
        if 0.30 <= roll < 0.48 and R.random() < 0.12:
            cid, name, region, plan = R.choice([c for c in CUST if any(ord(ch) > 127 for ch in c[1])])
        if roll < 0.18:
            out.append(f"{ts} INFO  api      http.request req={req()} method=GET path=/healthz status=200 ms={R.randint(1, 4)}")
        elif roll < 0.30:
            inv += 1
            net = PLANS[plan]
            out.append(f'{ts} INFO  biller   invoice.built req={req()} number=INV-{inv:06d} customer={cid} name="{name}" region={region} net={net} gst={half_up(net * GST[region][0], 100)}')
        elif roll < 0.48:
            e = evt()
            okname = all(ord(ch) < 128 for ch in name)
            p = R.choice(partners)
            if okname:
                out.append(f"{ts} INFO  notifier webhook.delivery partner={p} event={e} type=invoice.paid customer={cid} attempt=1 status=200 ms={R.randint(80, 600)}")
            else:
                for attempt, gap in [(1, 0), (2, 60), (3, 300), (4, 1800)]:
                    tt = t + timedelta(seconds=gap)
                    ts2 = tt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{R.randint(0, 999):03d}+13:00"
                    out.append(f'{ts2} WARN  notifier webhook.delivery partner={p} event={e} type=invoice.paid customer={cid} attempt={attempt} status=401 ms={R.randint(80, 600)} error="partner rejected signature"')
                out.append(f"{ts2} ERROR notifier webhook.gave_up partner={p} event={e} type=invoice.paid customer={cid} attempts=4")
                failed.append((e, p, cid, name))
        elif roll < 0.62:
            out.append(f"{ts} INFO  collector payment.cleared req={req()} invoice=INV-{R.randint(51000, inv):06d} customer={cid} amount={PLANS[plan] + half_up(PLANS[plan] * 15, 100)} provider_ref=ch_{req()}{req()}")
        elif roll < 0.67:
            out.append(f"{ts} WARN  collector payment.failed req={req()} invoice=INV-{R.randint(51000, inv):06d} customer={cid} failure_code={R.choice(['card_declined', 'insufficient_funds', 'expired_card'])}")
        elif roll < 0.71:
            out.append(f"{ts} INFO  dunning  dunning.retry customer={cid} attempt={R.randint(1, 4)} next_in_days={R.choice([1, 3, 5, 7])}")
        elif roll < 0.74:
            new = "growth" if plan == "starter" else "scale"
            left = R.randint(2, 29)
            out.append(f"{ts} INFO  api      proration.line req={req()} customer={cid} from={plan} to={new} days_left={left} cycle_days=30 amount={int(PLANS[new] * left / 30) - int(PLANS[plan] * left / 30)}")
        elif roll < 0.80:
            out.append(f"{ts} INFO  api      http.request req={req()} method={R.choice(['GET', 'POST'])} path={R.choice(['/v1/customers/' + cid, '/v1/invoices', '/v1/subscriptions/' + cid, '/v1/plans'])} status={R.choice([200, 200, 200, 201, 404])} ms={R.randint(8, 240)}")
        elif roll < 0.83:
            out.append(f"{ts} WARN  db       slow_query ms={R.randint(500, 2400)} table={R.choice(['invoices', 'payments', 'webhook_deliveries'])} rows={R.randint(1000, 90000)}")
        elif roll < 0.85:
            out.append(f"{ts} INFO  ntp      clock.offset ms={R.choice([-3, -1, 0, 1, 2, 4, 7])}")
        elif roll < 0.87:
            out.append(f"{ts} INFO  cache    cache.stats hits={R.randint(9000, 30000)} misses={R.randint(10, 900)} evictions={R.randint(0, 40)}")
        elif roll < 0.88:
            out.append(f"{ts} INFO  exporter export.written rows={R.randint(300, 700)} file=exports/{t.date().isoformat()}.csv ms={R.randint(900, 4000)}")
        else:
            out.append(f"{ts} DEBUG worker   queue.depth notifier={R.randint(0, 40)} biller={R.randint(0, 5)}")
    out.insert(len(out) // 3, "2026-10-07T09:12:44.118+13:00 INFO  deploy   release version=2.13.2 sha=4e1c9b0 by=ci")
    out.sort()
    return "\n".join(out) + "\n", failed


def changelog():
    out = ["# Changelog", "", "All notable changes to ledgerline. Newest first. Each entry names its ticket.", "", "## Unreleased", ""]
    areas = ["invoice", "proration", "dunning", "export", "webhooks", "coupons", "tax", "api", "plans", "sequences"]
    verbs = ["Fix", "Add", "Change", "Remove", "Speed up", "Document"]
    things = ["rounding of GST on invoices with many lines", "retry schedule read from config", "CSV column order for Xero",
              "event id format", "coupon expiry check", "trial plan handling", "the AU GST rate lookup", "invoice voiding of paid invoices",
              "suspension e-mails", "the partner endpoint list", "a race in invoice numbering", "slow export on large months",
              "plan catalogue caching", "error messages for unknown plans", "allocation of instalments"]
    tick = 230
    d = date(2026, 10, 1)
    for major, minor_top in [(2, 13), (1, 9)]:
        for minor in range(minor_top, -1, -1):
            for patch in range(R.randint(0, 2), -1, -1):
                out.append(f"## {major}.{minor}.{patch} ({d.isoformat()})")
                out.append("")
                for _ in range(R.randint(2, 6)):
                    tick -= 1
                    out.append(f"- {R.choice(verbs)} {R.choice(things)} ({R.choice(areas)}, BIL-{max(tick, 3)}).")
                out.append("")
                d -= timedelta(days=R.randint(9, 30))
    return "\n".join(out) + "\n"


csv_text, refunds = invoices_csv()
open(f"{root}/data/invoices_2026-08.csv", "w").write(csv_text)
ci, slow = ci_log()
open(f"{root}/logs/ci-nightly-2026-10-08.log", "w").write(ci)
st, failed = staging_log()
open(f"{root}/logs/staging-app.log", "w").write(st)
open(f"{root}/CHANGELOG.md", "w").write(changelog())
macron_rows = sum(1 for c in CUST if any(ord(ch) > 127 for ch in c[1]))
print("refund rows", refunds, "non-ascii customers", macron_rows, "failed events", len(failed))
for f in failed:
    print(" ", *f)
