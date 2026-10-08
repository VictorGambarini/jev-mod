# Adding a feature

1. **Declare it** in `src/core/registry.ts`: its id, title, one-line summary, help, the modes it
   has, its default, and any knobs (type, default, range). New features default to `shadow`.
   Ask `modeOf(io, '<id>')` before acting, and read knobs with `setting(io, '<id>')`; never
   read a file or a /config field for a switch of its own. That is all `/jev-mod` needs:
   `/jev-mod` lists it, `/jev-mod <id>` shows its help, and `/jev-mod <id> on|off|shadow` and
   `/jev-mod <id> <knob> <value>` set it, with nothing added to the command, and
   `/jev-mod dashboard` shows it with a control for its mode and each knob.
2. **A folder:** `src/features/<name>/`.
3. **The decision, pure:** `src/features/<name>/<rules>.ts`, plain functions with no IO, and
   `<rules>.test.ts` beside it (`import { test, expect } from 'claude-code/testing'`). Everything
   worth testing goes here: the kit can test it, and it cannot test hooks like `turn.step`.
4. **The glue:** `src/features/<name>/index.ts`, exporting functions that take an `IO` and the
   event's fields, call the engine in `src/engine/` with `hostOf(io)`, tally its calls with
   `core/jev.ts`'s `recordCalls` (pass the feature's id, and its calls and cost are counted as
   `asked` in its activity), and return what the hook should do. Never `$`: the validator
   refuses it across an import.
5. **Count what it did:** `activity.count(io, '<id>', '<outcome>')` from `core/activity.ts`
   each time it acts (`suggested`, `withheld`, a lane), and in shadow what it would have done
   (`would-suggest`, `would-withhold`): the dashboard shows both. `n` and a cost are optional
   (`count(io, id, outcome, n = 1, costUsd = 0)`); it is cheap, batched and never throws.
6. **Its memory, if it has any:** `memory.space<MySpace>('<name>')`, mutated in place, then
   `memory.save(io)`. The status line can read it.
7. **The wiring:** a few lines in `src/register.tsx`.
   - Something to say about each prompt? Add `<name>.analyse(io, text)` to the `Promise.all` in
     `prompt.submit`; return a string to add beside the prompt.
   - A tool result to change? Extend the `tool.call` hook, or add one with a matcher.
   - A say in whether a tool call may run? A `tool.check` hook (as the tool gate): `next(e)` is
     Claude Code's verdict and runs nothing; answer `{ decision: 'ask', reason }` to put the call
     to the person. Only tighten what `next(e)` returned, never loosen it.
   - A command of its own? Prefer a word under `/jev-mod` (`features/command/parse.ts`'s
     `WORDS`, and a case in `features/command/index.ts`). A separate command is registered in
     `session.start` and answered by a `command.run` hook whose matcher names it by literal.
   - Something the IO cannot do yet? Add it to `core/io.ts` and `ioOf` in `register.tsx`, with
     the literal names the validator wants.
8. **Fail open.** If the feature cannot decide, return null and let the hook pass the event on.
9. **Check it:** `claude plugin validate .`, `claude plugin test .`, then live: a headless
   `claude -p ... --plugin-dir .` run (stream-json for anything that needs the session open).
10. **Document it** in the README's feature table.
