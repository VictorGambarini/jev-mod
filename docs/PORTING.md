# Porting the engine to TypeScript

jev-mod's features still call the Python `jev` command (src/core/jev.ts). Each engine module
moves into `src/engine/`, in TypeScript, reaching the outside world only through `IO`; when a
module reproduces its parity fixtures exactly, the features switch to it and the CLI call goes.

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
| `client.json` | answer validation (incl. each invariant), question checks | 14 + 8 |
| `lanes.json` | `lane classify`: request and decision, every lane | 49 |
| `skills.json` | the catalog, `pick`: requests and picks, every branch | 16 |
| `compact.json` | `compact-select`: requests and fates | 2 |

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

A port may fix what the original got wrong, but only visibly: the fixture keeps Python's
answer, `test/parity/divergences.ts` gives the new one and why, and the parity test fails if
an entry stops differing.

## Order and status

| Module | From | Used by | Status |
|---|---|---|---|
| `engine/privacy.ts` | `privacy.py` | everything that sends text | **done**: 890 cases, 10 of them deliberately different (leak fixes, `test/parity/divergences.ts`); not wired in yet |
| `engine/screen.ts` | `rerank.local_screen`, `webscreen.py` | screening | **done** for the local screen, chunks, units and withholding (all fixtures; five deliberate mutations each caught). Asking Jev per chunk waits for `client.ts`; not wired in yet |
| `engine/client.ts` | `client.py` (questions, answer validation, transports) | everything | to do |
| `engine/backends.ts` | `backends.py`, `keystore.py` | client | to do: `systemone` and `openai` (logprobs) protocols |
| `engine/skills.ts` | `skillpick.py` | skills | to do |
| `engine/lanes.ts` | `lanes.py`, `policy.py`, `decide.py` (what `lane` needs) | routing | to do |
| `engine/compact.ts` | `compact.py` | /compact-jev | to do |
| key setup | `key_setup.py` | first run | to do: no Python, the key never in the conversation |
