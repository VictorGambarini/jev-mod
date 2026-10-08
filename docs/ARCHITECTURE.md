# Architecture

```
.claude-plugin/        plugin.json and marketplace.json: the repository is the plugin
hooks/hooks.json       → ../src/register.tsx
src/
  register.tsx         the only file that holds `$`; builds the IO, wires hooks to features
  core/                what every feature needs from Claude Code, through IO
    io.ts              the IO interface: everything the mod may do to the outside world
    jev.ts             the session's tally of backend calls, and the cool-off after a failure
    host.ts            the engine's Host, built from IO
    registry.ts        every feature, declared once: modes, default, knobs, help text
    config.ts          which features are on and how: kill files, /config, the project and user files, older switches
    settings.ts        jev's folder and private mode
    limits.ts          the daily budget, shared with the `jev` command
    memory.ts          per-session memory, one namespace per feature, in the mod's store
    activity.ts        what each feature did (or in shadow would have done), counted by day
    background.ts      work a hook starts and does not wait for: a shadow decision
  features/            one folder per feature
    command/           /jev-mod: index.ts · parse.ts and format.ts (pure) with their tests
    status/            /jev-mod status: index.ts · report.ts (pure) · report.test.ts
    dashboard/         /jev-mod dashboard: index.ts (glue) · state.ts (pure) · auth.mjs (pure) ·
                       server.mjs (bun/node, outside the mod) · page.html, with their tests
    routing/           index.ts (glue) · rules.ts (pure) · rules.test.ts
    skills/
    screening/         index.ts · targets.ts (pure) · targets.test.ts
    tool-gate/         index.ts (glue, on tool.check) · rules.ts (pure: risk classifier, state, verdict) · rules.test.ts
    trim-output/       index.ts (glue, archive) · trim.ts (fold, chunk, drop: pure) · their tests
    compact/           /jev-mod compact: index.ts · keep.ts (pure) · keep.test.ts
    stop-gate/         the completion gate: index.ts · gate.ts (pure) · gate.test.ts
  engine/              the decision engine, ported from jev-skills (docs/PORTING.md)
statusline/            the two-line status line (reads core/memory.ts's records)
test/parity/           fixtures captured from jev-skills; the engine port must match them
tools/parity/          the capture script
```

## Three layers

1. **`engine/`: decisions, with no Claude Code in it.** Request building, answer validation,
   backends, redaction, the injection screen, skill selection, the lane policy, transcript
   selection. It reaches the network and files only through the `IO` it is handed, so it is
   testable with a fake IO and reusable by anything that can provide one.
2. **`core/`: what every feature needs from Claude Code.** The engine's host, the call tally
   and its cool-off, jev's settings and budget, per-session memory, and (to come) per-turn facts and settings.
3. **`features/`: one folder each.** `index.ts` turns events into decisions using core; every
   rule worth testing lives in a plain file beside it with its tests.

## The rules the platform sets

These come from Claude Code's plugin validator and test kit (checked in the spike):

- **`$` never crosses an import.** The validator follows the engine handle only into functions
  declared in the same file. So `src/register.tsx` is the one file with `$`: it builds an `IO`
  (`ioOf($)`) and passes that everywhere. The validator still lists everything the mod reaches
  (`claude plugin validate .` shows each call "via ioOf").
- **Environment variables are named by literal** (`$.env.get('HOME')`), so the variables a mod
  reads can be listed. The IO has `home()`, not `env(name)`.
- **A command's own hook may not compact.** `/jev-mod compact` queues the built-in `/compact` with a
  marker from a timer, and answers that compaction itself.
- **The kit cannot raise `turn.step`, and does not route a mod's `$.process.run` to a test's
  stub.** It does stub `http.fetch`, `fs.read` and `env.get` (a stub answers `{ value: ... }`).
  So decisions live in pure files with kit tests, the engine reaches the network through
  `io.fetch` (stubbable), and the live behaviour is checked headless (`claude -p`, and
  stream-json sessions for anything that needs the session to stay open).

## Sending the agent back

`turn.complete` can only add text beneath an answer, and `turn.step`'s result never reaches the
engine, so neither can keep a turn going. The settings `Stop` event can: the mod hooks it as
`classic.Stop`, and a `block` re-prompts the main agent with that text (Claude Code shows it as
"Stop hook feedback"). Stop fires only when the main agent ends a turn normally: not on an
interrupt, an API error (StopFailure) or a subagent (SubagentStop). The completion gate lets the
settings Stop hooks beneath it answer first, and leaves a block of theirs as it is. Its own cap
(maxNudges per prompt, keyed by the event's `prompt_id`) bounds the loop. `src/stop-gate.test.ts`
raises Stop through the kit; the path that asks the backend is checked live.

## State

- **Per turn:** module variables in each feature (a turn's prompt, its lane).
- **Per session:** `core/memory.ts`, `store["sessions"][id].features[<feature>]`. It survives
  `--continue`, `--resume` and restarts, and the status line reads it.
- **Per day:** `core/activity.ts`, `store["activity"][day][<feature>]`: each outcome's count and
  the backend's cost, for the last 30 local days. Counts gather in the process and are written
  one after another, so features counting at once lose nothing.
- **Settings:** `core/config.ts`, read from the layers on each use; `/jev-mod` writes the user
  or project file through `config.write` and `config.reset`.
- **Across sessions:** the decision backend's own config (keys, tuning), outside the mod.

## The dashboard

A mod cannot listen on a port, so `/jev-mod dashboard` starts `features/dashboard/server.mjs`
with `bun` or `node` (`io.spawn`, which wraps `$.process.spawn`) and reads its stdout for as
long as the module lives. The two talk through stdout lines and one file:

```
server stdout → mod   {"ready":true,"port":…,"token":…,"pid":…}        once, after listen(0) on 127.0.0.1
                      {"op":"refresh"}                                  the state file is over 2 s old
                      {"id":"op-3-…","op":"set","scope":"user","feature":"skills","key":"mode","value":"shadow"}
mod → state file      ~/.config/jev-mod/dashboard/<session>/state.json  state.ts's State, rewritten with
                                                                        answered[<id>] after each change
```

The server never writes a config file and holds no registry: a change is checked by
`state.readLine` and applied with `config.write` / `config.reset` (the registry checks the
value), and the POST waits up to 3 s for its id in `answered`. GET `/api/state` serves the file.
Every request needs the token (a cookie set on the first `/?t=` load, which then redirects to
`/`) and a Host of `127.0.0.1:<port>` or `localhost:<port>`; a POST also needs the page's own
Origin, JSON, and an `X-Jev-Mod` header (`auth.mjs`, unit-tested). Bodies are capped at 4 KB.
The state holds no key: the backend part names where a key was found, not the key. The server
exits with the module, on `/jev-mod dashboard stop`, when its parent process goes away, or when a
write to its stdout fails (it writes a blank line every few seconds, so a server nobody reads any
more notices). Its pid and port (never its token) are kept in the run folder's `server.json`: a
copy of the module loaded after a reload ends the server an earlier copy left for the session,
once `ps` shows that pid is that server (`server.mjs` and this session's state file).
Every feature in the registry, with its knobs, is in the state, so a new feature appears on the
page with nothing added to the dashboard. With no bun or node, the same page is written as a
file with the state inside it, read-only.

## Tool results

One `tool.call` hook changes what a tool returned, in a fixed order: screening first (WebFetch,
WebSearch, MCP tools, Bash that fetches), then output trimming (every Bash output, a failed
command's included), on the text screening left. A large Bash output comes as a preview with the
whole of it in Claude Code's file; trimming reads that file, so for a command screening looks at
the file's text goes through the same screen (`screening.screenWhole`) first, and is not inlined
when it cannot be screened. A failed command's trimmed text goes back as `{ deny }`: core takes a
hook's `result` only in the tool's record shape and reads no `isError` from a hook, and a deny
after the tool ran is what the model reads as an error result. Each step is self-contained in the hook and
returns its own result or null; a step that returns null leaves the result as the step before it
made it, and a hook that changed nothing hands core the very object `next(e)` gave it.

## Failure

Every feature fails open: an answer it cannot get, or cannot trust, leaves the request as Claude
Code would have sent it. `core/jev.ts` stops asking for five minutes after a failure. A hook that
throws would be skipped by the engine; each of the mod's hooks carries a `.catch` that passes the
event on unchanged, so that is the mod's own choice (`claude plugin validate` lists each gating
hook "with .catch"). Both are silent: test the glue live, not only the rules.

Shadow never adds latency. In shadow a feature changes nothing, so the tool gate, the completion
gate and output trimming start the decision with `core/background.ts`'s `inBackground` and return
at once; the decision counts its own outcome when it lands, once, and anything it throws is
dropped. `on` waits for the answer, as it must.

## Protective features

`screening`, `tool-gate` and `stop-gate` are marked `protective` in the registry. A project's
`.claude/jev-mod.json` comes with a cloned repository, so for these `config.resolve` takes the
project's mode only when it is no looser (off < shadow < on) than what the layers beneath it give
(the user's file, the older switches, the default), and reads their knobs from the user's file
alone. `problems()` reports what was passed over ("project config may not lower screening"), and
`config.write` refuses to write it, so `/jev-mod ... --project` and the dashboard both refuse it.

## Seams kept for what comes next

- **Routing targets.** Routing picks a model id today. The plan is a target:
  `{ kind: 'anthropic', model }`, `{ kind: 'gateway', alias }`, or `{ kind: 'local', endpoint }`
  answered by the mod itself, for local models.
- **One request per prompt.** Skills and routing each ask the engine at submit, in parallel.
  With the engine in TypeScript they become one request (the questions side by side).
- **A status row drawn by the mod** (`AbovePrompt`), from the same memory records.
