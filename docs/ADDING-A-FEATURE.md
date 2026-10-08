# Adding a feature

1. **Declare it** in `src/core/registry.ts`: its id, title, one-line summary, help, the modes it
   has, its default, and any knobs (type, default, range). New features default to `shadow`.
   Ask `modeOf(io, '<id>')` before acting, and read knobs with `setting(io, '<id>')`; never
   read a file or a /config field for a switch of its own.
2. **A folder:** `src/features/<name>/`.
3. **The decision, pure:** `src/features/<name>/<rules>.ts`, plain functions with no IO, and
   `<rules>.test.ts` beside it (`import { test, expect } from 'claude-code/testing'`). Everything
   worth testing goes here: the kit can test it, and it cannot test hooks like `turn.step`.
4. **The glue:** `src/features/<name>/index.ts`, exporting functions that take an `IO` and the
   event's fields, call the engine in `src/engine/` with `hostOf(io)`, tally its calls with
   `core/jev.ts`'s `recordCalls`, and return what the hook should do. Never `$`: the validator refuses it across an import.
5. **Its memory, if it has any:** `memory.space<MySpace>('<name>')`, mutated in place, then
   `memory.save(io)`. The status line can read it.
6. **The wiring:** a few lines in `src/register.ts`.
   - Something to say about each prompt? Add `<name>.analyse(io, text)` to the `Promise.all` in
     `prompt.submit`; return a string to add beside the prompt.
   - A tool result to change? Extend the `tool.call` hook, or add one with a matcher.
   - A command? Register it in `session.start`, answer it with a `command.run` hook whose
     matcher names it by literal.
   - Something the IO cannot do yet? Add it to `core/io.ts` and `ioOf` in `register.ts`, with
     the literal names the validator wants.
7. **Fail open.** If the feature cannot decide, return null and let the hook pass the event on.
8. **Check it:** `claude plugin validate .`, `claude plugin test .`, then live: a headless
   `claude -p ... --plugin-dir .` run (stream-json for anything that needs the session open).
9. **Document it** in the README's feature table.
