# Skills

Suggests the one installed skill a prompt needs.

Modes: `on`, `shadow`, `off`. Default: `off`. The older *Skill suggestions* field in `/config` and jev-skills' `hook_skills` switch still work when no file sets this feature.

## What it decides

The one installed skill the prompt needs, if any, added as context beside the prompt:
"The `<name>` skill looks like the right procedure for this request (match 0.8). Invoke it with the Skill tool before starting, unless it clearly does not apply." A toast names it too.

## When it runs

At each prompt submit.

## How it decides

Only skills the session itself lists can be suggested, and of those only ones in the project's or your own `.claude/skills` folder: a plugin's skills (listed as `plugin:skill`) are never suggested. When the session cannot say what it lists, every skill found stands. The catalog is read again after five minutes. Three skills that are themselves skill pickers (`using-superpowers`, `skill-selector`, `skill-selection`) are never offered, and at most 960 skills are ranked.

A trivial prompt, or one that looks sensitive, is not sent. Otherwise two stages:

1. **Rank.** Each batch of 120 skills (name and the first 200 characters of its description) is one choice for the decision model, with "none" as an option. The five likeliest, above a floor of 0.02, go on.
2. **Verify.** The finalists, with the first 600 characters of each description, are judged in one request: does the turn need a specialised skill at all, and is each the right procedure.

A skill is suggested when "needs a skill" is at least `skillpick.need_threshold` (0.5) and its own match is at least `skillpick.match_threshold` (0.5). A named backend can set both, and `skillpick.shortlist_floor`, in its `tuning`.

Each skill is suggested at most once a session, in shadow too (counted as would-suggest once; the shadow list is kept apart, so turning shadow into on starts fresh). The last 20 are remembered.

## Settings

None beyond the mode.

## Failing open, privacy and budget

No answer (or one lost batch), a cool-off, private mode, the daily budget (a pick is charged as one, its two stages together), or a sensitive-looking prompt: no suggestion, and the prompt goes on as it is. The prompt is redacted and cut to 2,000 characters before it is sent. The request waits 5 seconds. In shadow the pick is made in line, as in `on`, and counted; nothing is added.

## Limits

- Plugin skills are never suggested.
- A skill the session does not list (disabled, or not one Claude Code reads) is never suggested.
- Over 960 skills, the last ones found are left out, and the reply says how many.

## Benchmarks

<!-- bench:start -->
No benchmark has been run yet for skills. How benchmarks are run and recorded: [src/bench/README.md](../../bench/README.md).
<!-- bench:end -->
