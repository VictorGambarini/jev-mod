# The dashboard (`/jev-mod dashboard`)

A local page in your browser to see and set every feature. `/jev-mod dashboard stop` ends it.

## What it shows

- Every feature with an off / shadow / on switch, its settings as inputs with their ranges, a `?` for its help, and where each value comes from (default, user, project, a kill file, `/config`), with a note when a higher layer overrides what you edit.
- A *User / This project* switch picks which file an edit goes to. In *This project*, a guarding feature's looser modes and its settings cannot be chosen (see *Settings* in the main README).
- Its other tabs: the last 14 days of activity (what each feature did, and in shadow would have done), today's spend against the daily budget, and the backend with where its key came from (never the key).

## How it runs

It needs `bun` or `node` on PATH: the mod starts a small server bound to 127.0.0.1 on a free port, reachable only with the one-time link it prints, and only while the session is open. The server writes nothing: each change goes back to the mod, which checks it as `/jev-mod` would and writes the config file.

Without bun or node it writes a read-only copy of the page instead (`~/.config/jev-mod/dashboard/<session>/dashboard.html`) and opens that.

What each feature did (and in shadow would have done) is counted by day for the last 30 days in the mod's own store.

`JEV_MOD_DASHBOARD` (comma-separated) is for testing: `no-browser` opens nothing, `static` writes the read-only page even when bun or node is there.
