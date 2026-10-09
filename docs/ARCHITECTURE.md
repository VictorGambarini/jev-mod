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
    access-gate/       index.ts (glue: the session's allows in $.state, /jev-mod access) · rules.ts (pure: the
                       categories, hosts, keys, the verdict, the refusal) · their tests; src/access-gate.test.ts
                       drives it through the kit
    rules-gate/        index.ts (glue, on tool.check: rule files by mtime) · rules.ts (pure: rule extraction, globs,
                       selection, the change, one question per rule, the refusal) · their tests
    find-files/        the find_files tool: index.ts (glue: listing, git grep, the backend) · rank.ts (pure: terms,
                       scores, cards, ranking) · their tests; src/find-files.test.ts drives it through the kit
    review-triage/     the review_triage tool: index.ts (glue: git, the backend) · triage.ts (pure: git's args, the
                       diff split, the capped redacted summary, the questions, the verdict, the answer) · their tests;
                       src/review-triage.test.ts drives it through the kit
    browser/           the browse tool: index.ts (glue: the loop, pauses) · rules.ts (pure: hosts, the action table,
                       consequential steps, questions, the answer) · child.ts (the driver process, the install) ·
                       driver.mjs and client.mjs (node, outside the mod) · their tests; driver.check.mjs (by hand)
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

## The access gate

`access-gate` shares the tool gate's `tool.check` hook (the engine takes one without a matcher)
and goes first in it: after Claude Code's verdict (and the rules gate's, beneath), a call short of
a deny that falls in a category the session has not allowed becomes `{ decision: 'deny', reason }`.
A deny, not an ask: in `bypassPermissions`, `auto` and `dontAsk` an ask would be settled without
the person. It calls no decision model: `rules.ts` reads Bash with the tool gate's `commandsIn`
(sudo, env, timeout, nohup, xargs, `bash -c`, eval) and matches each command's name and arguments;
Read, Grep, Write, Edit, MultiEdit and NotebookEdit by their path; an MCP tool by the words of its
name. The session's allows are `$.state` (`{ plugin: 'jev-mod', key: 'access' }` in
`types/index.d.ts`), stamped with the session id: the host keeps them for the session, through
hot reloads, and nothing writes them to disk, so a new session (or `--resume`) starts blocked.
`/jev-mod access <category> on` opens one only when `command.run`'s `origin` is the person's
(`composer` or `bridge`); closing one needs no such check. `refresh` puts the open ones in the
band's record (`access.open`), which draws them as `🔓 ssh`.

## The rules gate

`rules-gate` has its own `tool.check` hook, matched on Write, Edit, MultiEdit and NotebookEdit,
beside the tool gate's (the engine refuses two `tool.check` hooks without a matcher). After
Claude Code's verdict, an edit it would allow or ask about, to a file inside the project, may
become `{ decision: 'deny', reason }`: nothing has run, and the reason is the error the model reads
(the rule quoted, with its file). The rule files are found per edit: `CLAUDE.md`, `AGENTS.md` and
`CLAUDE.local.md` in each folder from the root down to the file's (`.claude/CLAUDE.md` at the
root), and `.claude/rules/**/*.md` whose front-matter `paths:` globs match the file (none: every
file). Each file is parsed once per mtime. Edits outside the project are left to the tool gate,
which only asks about them. In shadow everything past the config read runs in `inBackground`.

## A tool of the mod's own

`find-files` offers the model a tool, `mcp__jev-mod__find_files`: `$.tool.register` at
`session.start` (or at the first prompt after it is turned on) when its mode is `on`, answered
by a `tool.call` hook matched on that name. That hook is registered before the general
`tool.call` hook and never calls `next`, so screening and trimming never see its answer and no
permission dialog opens (it only reads). A registered tool cannot be withdrawn during a
session: turned off, it stays listed and answers that it is off.

It narrows locally first (`git ls-files -co --exclude-standard`, else a walk that skips
`node_modules`, `dist`, `build`, `vendor` and the like; `git grep -c` for how many lines of
each file mention the query's words; then the first 40 lines of the best few dozen), and
sends only the best `maxCandidates` to the decision model, as redacted cards, about 40 to a
request, packed by encoded size as compaction's turns are. Every failure (no key, private mode,
the budget, the cool-off, a timeout) answers with the local ranking, labelled as such.

`review-triage` offers `mcp__jev-mod__review_triage` the same way (off by default), for the model
to call before it reviews a change. It reads the change with git (`git diff HEAD` plus untracked
files; with none, `HEAD~1 HEAD`; given a `base`, `git diff --merge-base <base>`, or the range as
given), splits it per file and hunk, and builds a summary: hunks that look like they hold or handle
a secret (`isSensitive`) are left out, the rest redacted and each cut to the same length so all of
them fit `maxDiffChars`. One request asks seven `noul` questions about the whole change (the rules
question only when the project's CLAUDE.md or AGENTS.md has list items or rule words to send, capped
at 40 lines and 3000 characters). A confident no on all of them is `quick`; anything else is `full`,
and when more than one file was sent a second request asks each yes or unsure question of each of
the largest files (at most 40 questions) to name the files behind it. At most two requests, within
one `timeoutMs`. A withheld hunk makes it `full`; a diff over ten times `maxDiffChars`, or a summary
with less than half the changed lines left once secrets are out, is answered `full` without asking;
every failure (no key, private mode, the budget, the cool-off, a timeout) answers `full` with the
reason.

## The browser

`browser` offers `mcp__jev-mod__browse`, registered and answered as find-files' tool is (off by
default). Playwright is not bundled: `/jev-mod browser install` puts a pinned copy and its
Chromium in `<cache>/jev-mod/browser/`, and nothing else installs it. The browser runs in a child
(`driver.mjs` under node, else bun), because a mod cannot hold one. A spawned child's standard input is
written once and closed, so the start goes there (URL, hosts, the input values, which then live
only in that process) and every command after is one short `node client.mjs <socket>` run, through
the Unix socket the driver made (0600, in a 0700 folder) with the token it printed once:

```
mod → driver stdin     {startUrl, hosts, headed, cdp, values, textChars, maxRows, runDir}     once
driver stdout → mod    {"ready":true,"socket":…,"token":…} | {"error":"not_installed"|"no_browser"|…}
mod → client stdin     {"token":…,"op":"observe"} | {"op":"act","action":{kind,ref,input,expect}} | inputs | close
client stdout → mod    {"ok":true,"obs":{url,title,text,elements[],sensitive,more}} | {"left":url} | {"stale":true,…}
```

Each step: observe, build the table (rules.ts), redact and screen the page text (the injection
screen, whatever screening's own mode; a page with a password field or text that looks secret is
sent as its elements only), ask one choice, then a yes/no where a step needs one (done, or a
consequential step the goal names), then act. The driver aborts a main-frame navigation off the
hosts before it loads and reports a redirect that lands off them. A pause keeps the session (and
its child) in the module for 5 minutes under a random resumeId; `session.end` closes them all, and
the child also ends with the spawn loop, its parent, or 6 minutes without a command. The band
shows the step while it runs (`memory.space('browser')`). docs/BROWSER.md has the rules.

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

`screening`, `tool-gate`, `stop-gate`, `rules-gate` and `access-gate` are marked `protective` in the registry. A project's
`.claude/jev-mod.json` comes with a cloned repository, so for these `config.resolve` takes the
project's mode only when it is no looser (off < shadow < on) than what the layers beneath it give
(the user's file, the older switches, the default), and reads their knobs from the user's file
alone. `problems()` reports what was passed over ("project config may not lower screening"), and
`config.write` refuses to write it, so `/jev-mod ... --project` and the dashboard both refuse it.

`browser` is marked `risky`, the reverse: it acts for the person on the web, so a project's file
may only turn it off (a mode no further on than the layers beneath give), and its knobs
(`allowAttach`, `confirmConfidence`, `stepFloor` among them) come from the user's file alone.

## Seams kept for what comes next

- **Routing targets.** Routing picks a model id today. The plan is a target:
  `{ kind: 'anthropic', model }`, `{ kind: 'gateway', alias }`, or `{ kind: 'local', endpoint }`
  answered by the mod itself, for local models.
- **One request per prompt.** Skills and routing each ask the engine at submit, in parallel.
  With the engine in TypeScript they become one request (the questions side by side).
- **A status row drawn by the mod** (`AbovePrompt`), from the same memory records.
