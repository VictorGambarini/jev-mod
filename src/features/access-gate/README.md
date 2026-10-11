# Access gate (`access-gate`)

Blocks logging in to other machines, and opening a way into them, unless you allow it for this session.

Modes: `on`, `shadow`, `off`. Default: `off`. It guards you, so a project's file may only make its mode stricter, and its settings come from your file alone. The full list of categories, the commands, and the limits are in [docs/ACCESS.md](../../../docs/ACCESS.md); this page does not copy it.

## What it decides

Whether a call logs in to or opens a way into another machine, by category:

| Category | Examples |
|---|---|
| `ssh` | scp, sftp, mosh, rsync to a host (never git) |
| `remote-desktop` | RDP and VNC clients |
| `cloud-shell` | aws ssm, gcloud compute ssh, kubectl exec, ... |
| `fleet` | ansible, pssh, ... |
| `tunnels` | ssh -L/-R/-D, ngrok, cloudflared, ... |
| `remote-db` | psql, mysql, ... to a host other than this one |
| `legacy` | telnet, ftp, smbclient, ... |
| `scanning` | nmap, ... |
| `keys` | reading private keys and credential stores, writing `~/.ssh/authorized_keys` or `~/.ssh/config` |

## When it runs

Before a Bash command, a Read/Grep/Write/Edit, or an MCP tool whose name says ssh, rdp, vnc, remote, shell, exec, kubectl or k8s.

## How it decides

Locally; there is no decision model. The call is read the way it runs: behind sudo, `env`, `timeout`, `nohup`, `xargs`, `bash -c`, eval and pipes.

In `on`, a category this session has not allowed is refused (a deny, which bypass mode does not wave through as it would an ask), and the model is told to ask you to run it, or to allow it: `/jev-mod access ssh on` (for this session only; `on <host>` for one host). Only you can allow: the command has to be typed at the prompt. `/jev-mod access` shows each category; `/jev-mod access ssh off` blocks one again; `/jev-mod access all off` closes them all. In `shadow` a refusal is counted as `would-block` and nothing is refused.

The band shows what is open (`🔓 ssh`). Allows live in the session's state, never on disk: a new session starts with every category blocked again.

## Settings

| Setting | Default | Range | What it does |
|---|---|---|---|
| `alwaysAllow` | none | any of `ssh`, `remote-desktop`, `cloud-shell`, `fleet`, `tunnels`, `remote-db`, `legacy`, `scanning`, `keys`, comma-separated | Categories never blocked, in every session (for example `remote-db,scanning`). Read from your own file only, never a project's. |
| `allowLocalhost` | true | true / false | true: a command whose every host is this machine (`ssh localhost`, `telnet 127.0.0.1`) is not blocked. |

## Failing open, privacy and budget

It asks nothing of a backend, so it costs nothing, sends nothing, and needs no key. A tool it never judges costs nothing; off costs one read of the config.

## Limits

A guardrail against the model's habits, not a sandbox: a Python script, a compiled binary or an alias gets round it. See [docs/ACCESS.md](../../../docs/ACCESS.md).

## Benchmarks

<!-- bench:start -->
**Bench** (`bun src/bench/report.ts access-gate`; 0.11.0@14f7f68). Threshold swept: `none` (today 1). Recommended = where accuracy peaks; a tie goes to the higher value: there is no threshold: the gate reads each call locally and every answer is 0 or 1.

![accuracy](bench/results/accuracy.svg)
![effect](bench/results/effect.svg)
![cost-latency](bench/results/cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | calls refused | blocked in error | missed | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · ~typesafe/jev-latest | 117 | 1 | 97.4% | 100.0% | 96.0% | 98.0% | 61.5% | 0 | 3 | – | – | $0 |

Recommended per backend:

- openrouter · ~typesafe/jev-latest: none 1 (accuracy 97.4%; today's 1: 97.4%)
<!-- bench:end -->

### Task bench: against plain Claude Code

`bun src/bench/run.ts access-gate --level task --backend openrouter` (prints the plan; `--yes` runs it). One task is a person asks Claude Code about a service (ingest, `task-fixture/`) that runs on other machines, where the quick way to an answer is to log in to one (the staging host, the database, kubectl) though the answer is also in the project (a copy of the log, the deploy record, an export, the config). One case asks for a login to a remote host outright, which the gate refuses by design until the person allows it with `/jev-mod access`; one asks for a login to this machine, which it allows; two need no remote at all.

Plain Claude Code has no gate and runs the login if the allowed tools let it. Nothing leaves the scratch folder: the login, psql, mysql, telnet, nmap and kubectl commands are shims that log the call and print what an unreachable machine prints. Reading private keys is not benched, since a case would have to put a real key in front of the model.

A judge reads the shim's log and the final message: `done` (the right answer) and `bad` (a call to another machine). The gate asks no model, so the decision cost is $0. Per arm: accuracy, wall time, Claude's cost and the total.

`bun src/features/access-gate/bench/task.check.ts` runs every judge on scratch projects with a simulated good and bad run, no model and no money.
