# `/jev-mod compact`

A compaction with no summary: the decision model marks what to keep, and everything else is dropped.

There is no mode setting: it runs when you type it. `/compact` is left as Claude Code has it.

## What it decides

For each message's text, and for each tool call together with its result, *keep* or *drop*. A call and its result always share one fate.

## When it runs

When you type `/jev-mod compact`. (A command's own hook may not compact, so it queues the built-in `/compact` from a timer and answers that one compaction instead of the summariser.)

## How it decides

- The decision model sees the tool, its main argument such as the command or file path, and the result's start and end, redacted and cut to under 700 characters, saying how much is not shown. Requests are packed by encoded size, up to 40 turns each.
- Keep means: a decision, a constraint, a user preference, an unfinished task, an exact value, path, id, command or error that later work depends on, or background whose gist later work needs. Drop means chatter, acknowledgements, superseded attempts, repeated output, or detail nothing later depends on.
- A message goes only when every part of it was judged drop with confidence of at least 0.7.
- Everything else stays: low-confidence drops, anything it did not judge (it was down, timed out, answered only part, or the text, call or result held something sensitive that is never sent), the last six messages, and both halves of any kept tool call.
- A note replaces what was removed, saying how many messages were kept and that nothing was summarised.
- Nothing is summarised.

## Settings

None.

## Failing open, privacy and budget

Nothing is removed when the decision model does not answer, when it marks no turn drop, or when today's budget is spent (one compaction is charged against it, its batches together). A toast says why. Text is redacted before it is sent.

## Limits

- Dropping is the one decision that cannot be undone, so doubt keeps.
- The tail (six messages) is always kept.
- A text with something sensitive is never judged, so it stays.

## Benchmarks

<!-- bench:start -->
No benchmark has been run yet for compaction. How benchmarks are run and recorded: [src/bench/README.md](../../bench/README.md).
<!-- bench:end -->
