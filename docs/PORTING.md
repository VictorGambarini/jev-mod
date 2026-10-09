# Porting the engine to TypeScript

Each engine module moves from jev-skills' Python into `src/engine/`, in TypeScript, reaching the
outside world only through a `Host` (`core/host.ts` builds one from `IO`); when a module
reproduces its parity fixtures exactly, the features switch to it and their call to the Python
`jev` command goes. Every feature has switched, the bridge to the command is gone, and the
key is set in the mod's own settings: jev-mod needs nothing from jev-skills.

## Parity fixtures

`test/parity/fixtures/*.json` were captured from jev-skills' Python engine by
`tools/parity/capture.py`, over a fixed corpus (hand-written cases plus every string in its
privacy, screening and client tests) and against its scripted backend, so the end-to-end cases
record both the request sent and the decision reached:

| Fixture | What | Cases |
|---|---|---|
| `privacy.json` | `normalize`, `redact` (4000 and 80 chars), `is_sensitive` | 847 |
| `privacy_unicode.json` | the same, on where Python's regex and JavaScript's differ | 43 |
| `local_screen.json` | the local injection screen, normal and `unvetted` | 1,206 |
| `local_screen_unicode.json` | the same, on code-point windows (astral and accented padding at each window's edge), whitespace before an opening verb, and a newline before the verb (Python's `$`) | 2,016 |
| `screen_patterns.json` | the source of every compiled pattern in the screen, which the port must copy exactly | 37 |
| `webscreen.json` | chunking, units (structured and raw), withholding | 27 texts, 11 unit sets |
| `webscreen_unicode.json` | the same, on astral characters at the chunk edge, Python's whitespace, and Python's JSON (key order, big integers, floats, NaN, malformed shapes) | 5 texts, 14 unit sets |
| `client.json` | answer validation (incl. each invariant), question checks, word for word | 39 + 24 |
| `client_ask.json` | `ask`: for each way a request is routed (every provider, a gateway, named backends, overrides, missing keys, the size limit in code points, retries, refused replies) the exact URL, body and headers sent, the reply, and the outcome | 54 |
| `urls.json` | `backends.check_url` and the gateway rule on URL edge cases | 40 |
| `webscreen_screen.json` | screening end to end against the scripted backend: requests, verdict, withheld text | 10 |
| `lanes.json` | `lane classify` end to end: every request with its reply, every lane; confidence on each threshold, the answering model's version (drift, shadow), outages, the budget spent, the caller's facts, secrets, context, the field caps | 98 |
| `lane_grid.json` | `policy.readings` and `policy.apply` over the lane policy: every choice, on and either side of each confidence, security and underspecified threshold | 1,400 |
| `policy_engine.json` | pre-rules on facts Python compares loosely (`1 == True`, a bool is no number), `drifted` and `version_of` | 16 + 64 |
| `policy_lint.json` | `policy.lint` on every shipped policy and the lane policy broken 58 ways, each message word for word | 72 |
| `lane_policy.json`, `lane_targets.json` | the shipped lane policy; `lanes.targets` with lanes.json files laid on top | 1, 22 |
| `skill_text.json` | `looks_trivial` on every string the skill tests use plus Unicode, apostrophes, question marks in four scripts; `_front_matter` on block scalars, CRLF, Python's line ends and whitespace | 449 + 51 |
| `skill_catalogs.json`, `skills.json` | `pick` end to end over 11, 130 and 1,000 skills: every request with the reply it got (the batches go out side by side, so the test answers by body), the result; every branch (trivial, sensitive, no skills, one batch lost, stage 2 lost, the cap, ties, `round()`'s ties) | 50 runs |
| `compact_convos.json`, `compact.json` | `compact.select` end to end: every request with its reply, in order; several batches, batches cut by encoded size (Japanese), system, empty, list and secret turns, drops either side of 0.7, `keep_last` from 0 past the length, one batch lost, all lost, a refusal | 23 runs |

To regenerate (while a jev-skills checkout exists), then refresh the `.ts` copies the tests
import (the plugin test runner loads code files only; CI checks the copies are current):

```bash
python3 tools/parity/capture.py ~/github/jev-skills test/parity/fixtures
python3 tools/parity/to_ts.py
```

Translating a Python pattern: copy it exactly as Python wrote it and compile it with `py()`
(`engine/pyre.ts`), which gives `\d`, `\w`, `\s`, `\b`, `^`, `$`, `.` and named groups Python's
meaning. Count lengths and offsets in code points (`pyre.Text`), never `.length` or a
RegExp's `index`. JSON a Python module rewrote goes through `engine/pyjson.ts`, which keeps
key order, big integers and Python's float formatting.

A fixture passing proves little until it is shown to fail: for each port, break the
translation on purpose (a window off by one, JavaScript's `$`, its whitespace, its float
format) and check that a parity test catches it. Where none does, the fixture needs cases.

Known differences that are not fixture answers, and why:

- **Redirects.** client.py refused every 3xx. Claude Code's fetch follows a redirect but drops
  `Authorization` when it leaves the origin (checked against two local servers), so a key still
  cannot reach another host; the redirected reply then fails to parse and the call fails open.
- **Who the client says it is.** `User-Agent`, and OpenRouter's `HTTP-Referer` and `X-Title`,
  name jev-mod rather than jev-skills. The parity test passes jev-skills' values in.
- **A cool-off screens locally.** The CLI path skipped screening entirely while the backend was
  cooling off after a failure; the engine path screens with the local patterns meanwhile.
- **Where skills are found.** skillpick.discover walked every folder under a root; a user's
  skills folder holds whole repositories (gstack keeps test fixtures and an OpenClaw copy of
  itself there), so it offered skills Claude Code never lists (`alpha`, `gstack-openclaw-*`).
  `engine/skills.ts` reads Claude Code's layout, `<root>/<folder>/SKILL.md`, and the feature
  then keeps only the skills the session itself lists (`$.session.usage` with a local
  `summary` breakdown). Front matter, names and the rest of the pick are as Python had them.
- **The secret check before a decision** (`decide`) reads the state as text, not as escaped
  JSON as decide.py did, where privacy.ts's fixes could not see a key behind an accented letter
  (`LANE_DIVERGENCES` in test/parity/divergences.ts); a card in another script goes masked.
- **The daily budget** is the same limits.json and limits.state.json, read and written without
  limits.py's flock, which a mod cannot hold: two processes at the same instant may lose a count.
- **Private profiles** are not routed either; `jev lane classify` did not check them.
- **No ledger rows.** decide.py appended every decision to the ledger; the mod tallies calls and
  cost in the session record (the status line's) instead. Policy labels and state digests,
  which only the ledger used, are not computed.
- **Switches default to on.** jev-skills read a switch nobody set as off; the mod is installed to
  do these things, so with no setting anywhere a switch is on. A set value, an unreadable or
  misspelt one (off), and the `<SWITCH>_OFF` files read as before.
- **Already suggested** is remembered in the session record, not jev-skills'
  `jev-hooks-sessions.json`, and the mod writes no `jev-hooks.jsonl` row per prompt.
- **backends.json that cannot be read** (a permissions error, say) reads as no file at all,
  rather than as a misconfiguration; a file that is not JSON is still a misconfiguration.
- **Phones in identifiers.** privacy.py's phone rule ate the digits of a DOI
  (`10.1186/s13568-017-0448-4` became `10.1186/s[phone]-4`), a URL path and a bare ISBN-13.
  privacy.ts holds DOIs aside from the digit rules, skips a run right after `/` or `.` or one
  that goes on as `-4`, `.5`, `/2`, and keeps a bare run of 12 or more digits; it also masks a
  bracketed two-to-four digit area code (`(09) 373 7599`). No captured fixture's answer changes,
  so divergences.ts has no entry; privacy.test.ts pins the new cases.

A port may fix what the original got wrong, but only visibly: the fixture keeps Python's
answer, `test/parity/divergences.ts` gives the new one and why, and the parity test fails if
an entry stops differing.

## Order and status

| Module | From | Used by | Status |
|---|---|---|---|
| `engine/privacy.ts` | `privacy.py` | everything that sends text | **done**: 890 cases, 10 of them deliberately different (leak fixes, `test/parity/divergences.ts`); not wired in yet |
| `engine/screen.ts` | `rerank.local_screen`, `webscreen.py`, `hooks.screen_text` | screening | **done and wired in** (five deliberate mutations each caught) |
| `engine/client.ts` | `client.py`, `ledger.cost` | everything | **done** (six deliberate mutations each caught) |
| `engine/backends.ts`, `engine/keys.ts` | `backends.py`, `tuning.check`, `keystore.py` (reading) | client | **done** (`systemone`, the only protocol jev-skills has) |
| `engine/skills.ts` | `skillpick.py`, `hooks.user_prompt` | skills | **done and wired in** (nine deliberate mutations caught; the tenth, `trim` for `strip` in the gate, cannot change an answer) |
| `engine/lanes.ts`, `engine/policy.ts`, `core/limits.ts` | `lanes.classify`/`targets`, `decide.decide`, `policy.py` (load, lint, readings, rules, drift), `limits.py` | routing | **done and wired in** (thirteen deliberate mutations caught, after adding cases for two the first run missed) |
| `engine/compact.ts` | `compact.select` | /jev-mod compact | **done and wired in** (nine deliberate mutations caught; the tenth, clipping at 701, cuts at the same 350 as 700 and cannot change an answer; 702 is caught) |
| key setup | `key_setup.py`, `jev doctor`, `jev switches` | first run | **done, differently**: the key is a sensitive `userConfig` field Claude Code keeps in its credential store (Keychain on macOS, a 0600 file on Linux) and hands only to the mod (`/plugin` or `claude plugin configure`), so no page or terminal prompt is needed; `/jev-mod status` checks it with key_setup's own verification question; the switches and private mode are `/config` settings |
