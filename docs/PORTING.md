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
| `local_screen.json` | the local injection screen, normal and `unvetted` | 1,206 |
| `webscreen.json` | chunking, units (structured and raw), withholding | 27 texts, 11 unit sets |
| `client.json` | answer validation (incl. each invariant), question checks | 14 + 8 |
| `lanes.json` | `lane classify`: request and decision, every lane | 49 |
| `skills.json` | the catalog, `pick`: requests and picks, every branch | 16 |
| `compact.json` | `compact-select`: requests and fates | 2 |

To regenerate (while a jev-skills checkout exists):

```bash
python3 tools/parity/capture.py ~/github/jev-skills test/parity/fixtures
```

## Order and status

| Module | From | Used by | Status |
|---|---|---|---|
| `engine/privacy.ts` | `privacy.py` | everything that sends text | to do |
| `engine/screen.ts` | `rerank.local_screen`, `webscreen.py` | screening | to do |
| `engine/client.ts` | `client.py` (questions, answer validation, transports) | everything | to do |
| `engine/backends.ts` | `backends.py`, `keystore.py` | client | to do: `systemone` and `openai` (logprobs) protocols |
| `engine/skills.ts` | `skillpick.py` | skills | to do |
| `engine/lanes.ts` | `lanes.py`, `policy.py`, `decide.py` (what `lane` needs) | routing | to do |
| `engine/compact.ts` | `compact.py` | /compact-jev | to do |
| key setup | `key_setup.py` | first run | to do: no Python, the key never in the conversation |
