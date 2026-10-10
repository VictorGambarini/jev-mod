# The access gate

Claude sometimes reaches for another machine to try something: it SSHes into your VM, opens a
tunnel, or points `psql` at production, when it should have asked you. The access gate
(`access-gate`) refuses those calls unless you have allowed them for this session.

Turn it on with `/jev-mod access-gate on` (or `shadow` first: it counts `would-block` and refuses
nothing). It is off by default, like every new feature.

## What it blocks

Each category is blocked while the gate is on, until you allow it.

| Category | What counts |
|---|---|
| `ssh` | `ssh`, `scp`, `sftp`, `mosh`, `autossh`, `sshpass`, `ssh-copy-id`, `sshfs`, `tailscale ssh`, `cloudflared access`; `rsync` to a `host:` path or over `-e ssh`. **Not** git: `git push`/`pull` over ssh is fine. |
| `remote-desktop` | `xfreerdp`, `wlfreerdp`, `rdesktop`, `remmina`, `vncviewer`, `xtightvncviewer`, `x2goclient`; `rdp://` and `vnc://` links opened with `xdg-open` or `open`. |
| `cloud-shell` | `aws ssm start-session`, `aws ec2-instance-connect`, `gcloud compute ssh/scp`, `gcloud cloud-shell ssh`, `az ssh`, `az vm run-command`, `kubectl exec/attach/cp/port-forward/debug`, `oc rsh/exec`, `docker exec/cp` against a remote daemon (`-H`, `--host`, `--context`, `DOCKER_HOST`), `virsh console`, `vagrant ssh`, `multipass shell/exec`. |
| `fleet` | `ansible`, `ansible-playbook`, `pssh`/`parallel-ssh`, `salt`, `fab`, `pdsh`, `clush`. |
| `tunnels` | `ssh -L/-R/-D` (also `ssh`), `ngrok`, `cloudflared tunnel`, `tailscale serve/funnel/up`, `chisel`, `frpc`, `socat` with a `*-LISTEN` address, `nc`/`ncat` with `-l`, `localtunnel`/`lt`, `bore`. |
| `remote-db` | `psql`, `mysql`, `mariadb`, `mongosh`, `mongo`, `redis-cli`, `sqlcmd` (and their dump tools) to a host that is not this machine: `-h`, `--host`, `-S`, a URI, a `host=` connection string, `PGHOST`. Local ones (`localhost`, `127.0.0.1`, `::1`, a socket path, no host) are not counted at all. |
| `legacy` | `telnet`, `ftp`, `lftp`, `tftp`, `rlogin`, `rsh`, `smbclient`, `mount -t cifs/nfs` (or a `//host/share` or `host:/path` source). |
| `scanning` | `nmap`, `masscan`, `zmap`, `rustscan`. |
| `keys` | Reading or copying a private key or credential store: `~/.ssh/id_*` and `~/.ssh/*key*` (never `*.pub`), the `~/.ssh` folder whole, `~/.aws/credentials`, `~/.kube/config`, `~/.docker/config.json`, `~/.netrc`, gpg's private keys, `gpg --export-secret-keys`. Writing `~/.ssh/authorized_keys` or `~/.ssh/config`. Through Bash and through the Read, Grep, Write, Edit, MultiEdit and NotebookEdit tools. Logging in with `ssh -i <key>`, `ssh-add`, `chmod 600` and `ls ~/.ssh` are not key reads. |

An MCP tool whose name has the word `ssh` (or `sftp`, `scp`) counts as `ssh`; `rdp` or `vnc` as
`remote-desktop`; `remote`, `shell`, `exec`, `kubectl`, `k8s` or `kubernetes` as `cloud-shell`.
The word must stand alone in the name (`run_shell`, `sshExec`): `execute_query` is not `exec`.

A command is read the way it runs: cut at `;`, `&&`, `||`, `|` and new lines, and behind `sudo`,
`env X=Y`, `timeout`, `nohup`, `xargs`, `bash -c`/`sh -c`/`zsh -c` and `eval`, a few levels down.
`ssh -V`, `man ssh`, `which ssh` and `echo "ssh vm1"` are not counted.

## Allowing it

Allows are for this session only. They live in the session's state that Claude Code holds for
the mod, never on disk, so the next session starts with every category blocked again.

| Command | What it does |
|---|---|
| `/jev-mod access` | Each category: blocked, allowed this session (to which hosts), or allowed in every session; and the gate's mode. |
| `/jev-mod access ssh on` | Allows `ssh` for this session, to any host. |
| `/jev-mod access ssh on vm1` | Allows `ssh` only to `vm1` (run it again to add `vm2`; `*.lab.example` is a pattern). A call whose host cannot be read (`rsync -e ssh` with local paths, a cloud shell with no name) is refused while a host scope is set. |
| `/jev-mod access ssh off` | Blocks it again. |
| `/jev-mod access all off` | Blocks every category again. |

Only you can open a category: the command has to be typed at the prompt (or sent from the
Remote Control bridge). Run by a plugin, or any other way, it changes nothing. Closing one works
from anywhere.

While a category is open, the band above the prompt shows it in yellow: `🔓 ssh (vm1)`.

Two settings, from your own `~/.config/jev-mod/config.json` only (a project's
`.claude/jev-mod.json` may turn the gate on, never off, and sets neither):

- `alwaysAllow`: categories open in every session, comma-separated (`/jev-mod access-gate alwaysAllow remote-db,scanning`). Default: none.
- `allowLocalhost` (default `true`): a call whose every host is this machine (`ssh localhost`, `telnet 127.0.0.1`) is not refused.

```json
{"features": {"access-gate": {"mode": "on", "alwaysAllow": "remote-db", "allowLocalhost": true}}}
```

## What Claude is told

A refused call is a deny, with the reason as the error Claude reads:

```text
jev-mod access gate refused this call.
This session does not allow ssh: `ssh victor@vm1 uptime`.
Do not try another way round it. Ask the person to run it themselves, or to allow ssh for this session with /jev-mod access ssh on.
```

A deny, not a permission prompt: in `bypassPermissions`, `auto` and `dontAsk` modes a prompt
would be answered without you.

## Limits

This is a guardrail against the model's habits, not a sandbox. It reads command lines against
patterns, and a pattern gate can be got round:

- a script that does the same thing: Python with `paramiko`, Node with `ssh2`, `curl` to a cloud
  API, a `Makefile` target, a shell script in the repo (`./deploy.sh` is not read);
- a compiled binary, an alias or a shell function with another name;
- a variable or a file holding the host or the command (`$TARGET`, `xargs ssh < hosts`);
- `cd ~/.ssh && cat id_rsa` (the folder change is not followed), and other plain-file readers it
  does not know.

It also does not guard its own switches: a model that edits `~/.config/jev-mod/config.json` can
turn it off. The tool-call gate may ask before such a write outside the project, if it is on (it is
off by default) and Jev doubts the call was asked for and judges it hard to undo; it skips on a
timeout, private mode, the budget and the cool-off.

An MCP server whose name has one of the words above (`remote-devices`, say) is caught as a whole,
even for tools that do not log in anywhere; allow its category for the session, or add it to
`alwaysAllow`.

What it is good for: the model reaching for `ssh` or `kubectl exec` out of habit is stopped, and
told to ask you. For real isolation, run the session in a container or a VM without your keys.
