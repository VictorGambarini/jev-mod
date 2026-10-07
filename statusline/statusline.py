#!/usr/bin/env python3
"""A two-line Claude Code status line: the session on top, what jev decided below.

    [Opus 5.5 · medium] 📁 jev-mod | 🌿 main* | +120/-30
    ██░░░░░░░░ 25% · 84k/200k | $1.23 | ⏱️ 1h 5m | 5h 23% · 7d 41%
    🧭 jev small · haiku 4.5 · low | 🎯 release-notes | 🛡 withheld 2 | 🔌 jev via openrouter

Plain coloured text, three short lines: where you are, what the session has used (the bar is
context used: green, yellow from 70%, red from 90%), and what jev decided this turn, read from the
mod's own record of the session (its plugin store file, src/core/memory.ts): the lane, model and
effort, the last skill suggested, how many injected parts were withheld, and the decision backend.
Without the mod in the session line three shows the backend and the hook switches instead.

Side effects kept from the earlier script, both atomic and best-effort (a read-only disk never
breaks or slows the line): ~/.claude/statusline-quota.json, a flat quota/context snapshot for
other processes to poll, and ~/.claude/statusline-last-payload.json, the raw payload.

Settings: "statusLine": {"type": "command", "command": "<path to this file>"}.
"""
from __future__ import annotations

import glob
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

HOME = Path.home()
CLAUDE_DIR = Path(os.environ.get("CLAUDE_CONFIG_DIR") or HOME / ".claude")
QUOTA_FILE = CLAUDE_DIR / "statusline-quota.json"
RAW_FILE = CLAUDE_DIR / "statusline-last-payload.json"

CYAN, GREEN, YELLOW, RED, DIM, RESET = "\033[36m", "\033[32m", "\033[33m", "\033[31m", "\033[2m", "\033[0m"
SEP = " | "


def c(text: str, colour: str) -> str:
    return colour + text + RESET


def num(value: Any) -> Optional[float]:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def human(n: Optional[float]) -> Optional[str]:
    if n is None:
        return None
    if n >= 1_000_000:
        return f"{round(n / 100_000) / 10:g}M"
    if n >= 1000:
        return f"{round(n / 1000)}k"
    return str(round(n))


def level(pct: float, warn: float = 70, bad: float = 90) -> str:
    """Colour for a fill level: green, yellow at `warn`, red at `bad`."""
    return RED if pct >= bad else YELLOW if pct >= warn else GREEN


# ── side files, as the earlier script wrote them ────────────────────────────

def write_atomic(path: Path, text: str) -> None:
    try:
        tmp = path.with_name(f"{path.name}.tmp.{os.getpid()}")
        old = os.umask(0o077)
        try:
            tmp.write_text(text, encoding="utf-8")
        finally:
            os.umask(old)
        os.replace(tmp, path)
    except OSError:
        pass


def context_used(cw: Dict[str, Any]) -> Optional[float]:
    if num(cw.get("total_input_tokens")) is not None:
        return num(cw["total_input_tokens"])
    usage = cw.get("current_usage")
    if isinstance(usage, dict):
        return sum(num(usage.get(k)) or 0 for k in
                   ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
    return None


def side_files(raw: str, data: Dict[str, Any]) -> None:
    def iso(epoch: Any) -> Optional[str]:
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch)) if num(epoch) is not None else None

    cw = data.get("context_window") or {}
    rl = data.get("rate_limits") or {}
    five, week = rl.get("five_hour") or {}, rl.get("seven_day") or {}
    cost = data.get("cost") or {}
    model = data.get("model") or {}
    snapshot = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "session_id": data.get("session_id"), "model_id": model.get("id"),
        "model_display_name": model.get("display_name"), "claude_code_version": data.get("version"),
        "five_hour_used_percentage": num(five.get("used_percentage")),
        "five_hour_resets_at_epoch": num(five.get("resets_at")), "five_hour_resets_at_iso": iso(five.get("resets_at")),
        "seven_day_used_percentage": num(week.get("used_percentage")),
        "seven_day_resets_at_epoch": num(week.get("resets_at")), "seven_day_resets_at_iso": iso(week.get("resets_at")),
        "context_used_tokens": context_used(cw), "context_total_tokens": num(cw.get("context_window_size")),
        "context_used_percentage": num(cw.get("used_percentage")),
        "context_remaining_percentage": num(cw.get("remaining_percentage")),
        "context_output_tokens": num(cw.get("total_output_tokens")),
        "exceeds_200k_tokens": data.get("exceeds_200k_tokens") if isinstance(data.get("exceeds_200k_tokens"), bool) else None,
        "cost_total_usd": num(cost.get("total_cost_usd")), "total_duration_ms": num(cost.get("total_duration_ms")),
    }
    write_atomic(QUOTA_FILE, json.dumps(snapshot, separators=(",", ":")) + "\n")
    write_atomic(RAW_FILE, raw)


# ── line one: the session ───────────────────────────────────────────────────

def git(cwd: str) -> Optional[tuple]:
    """(branch, dirty) or None outside a repository."""
    def run(*args: str) -> str:
        done = subprocess.run(["git", "-C", cwd, "--no-optional-locks", *args],
                              capture_output=True, text=True, timeout=2)
        return done.stdout.strip() if done.returncode == 0 else ""
    try:
        branch = run("symbolic-ref", "--short", "HEAD") or run("rev-parse", "--short", "HEAD")
        return (branch, bool(run("status", "--porcelain"))) if branch else None
    except (OSError, subprocess.SubprocessError):
        return None


def line_one(data: Dict[str, Any]) -> str:
    cwd = (data.get("workspace") or {}).get("current_dir") or os.getcwd()
    model = (data.get("model") or {}).get("display_name") or "?"
    effort = (data.get("effort") or {}).get("level")
    parts = [c(f"[{model}" + (f" · {effort}" if effort else "") + "]", CYAN) + f" 📁 {os.path.basename(cwd) or cwd}"]
    repo = git(cwd)
    if repo:
        branch, dirty = repo
        parts.append(f"🌿 {branch}" + (c("*", YELLOW) if dirty else ""))
    cost = data.get("cost") or {}
    added, removed = cost.get("total_lines_added"), cost.get("total_lines_removed")
    if added or removed:
        parts.append(c(f"+{added or 0}", GREEN) + "/" + c(f"-{removed or 0}", RED))
    return SEP.join(parts)


def line_usage(data: Dict[str, Any]) -> str:
    parts: List[str] = []
    cw = data.get("context_window") or {}
    used, size = context_used(cw), num(cw.get("context_window_size"))
    pct = num(cw.get("used_percentage"))
    if pct is None and num(cw.get("remaining_percentage")) is not None:
        pct = 100 - num(cw["remaining_percentage"])
    if pct is None and used is not None and size:
        pct = used / size * 100
    if pct is not None:
        pct = max(0.0, min(100.0, pct))
        filled = int(pct // 10)
        amount = f" · {human(used)}/{human(size)}" if used is not None and size else ""
        parts.append(c("█" * filled + "░" * (10 - filled), level(pct)) + f" {pct:.0f}%{amount}")

    cost = data.get("cost") or {}
    if num(cost.get("total_cost_usd")) is not None:
        parts.append(c(f"${cost['total_cost_usd']:.2f}", YELLOW))
    if num(cost.get("total_duration_ms")) is not None:
        minutes = int(cost["total_duration_ms"] // 60000)
        parts.append("⏱️ " + (f"{minutes // 60}h {minutes % 60}m" if minutes >= 60 else f"{minutes}m"))

    rl = data.get("rate_limits") or {}
    limits = []
    for label, key in (("5h", "five_hour"), ("7d", "seven_day")):
        value = num((rl.get(key) or {}).get("used_percentage"))
        if value is not None:
            limits.append(f"{label} " + c(f"{value:.0f}%", level(value)))
    if limits:
        parts.append(" · ".join(limits))
    return SEP.join(parts)


# ── line two: jev ───────────────────────────────────────────────────────────

def jev_config_dir() -> Path:
    if os.environ.get("JEV_HOME"):
        return Path(os.environ["JEV_HOME"]).expanduser()
    hermes = Path(os.environ.get("HERMES_HOME") or HOME / ".hermes")
    if os.environ.get("HERMES_HOME") or hermes.is_dir():
        root = hermes.parent.parent if hermes.parent.name == "profiles" else hermes
        return root / "jev"
    return Path(os.environ.get("XDG_CONFIG_HOME") or HOME / ".config") / "jev"


def read_json(path: Path) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def backend_name() -> str:
    xdg = Path(os.environ.get("XDG_CONFIG_HOME") or HOME / ".config") / "jev"
    pinned = os.environ.get("JEV_BACKEND", "").strip()
    default = read_json(Path(os.environ.get("JEV_BACKENDS") or xdg / "backends.json")).get("default")
    name = pinned if pinned and pinned not in ("default", "none") else (default if not pinned else None)
    if name:
        return name
    for provider in ("typesafe", "openrouter", "venice", "zen"):
        file = "credentials" if provider == "typesafe" else f"credentials-{provider}"
        if (xdg / file).is_file():
            return f"jev via {provider}"
    return "jev"


def mod_record(session: Optional[str]) -> Optional[Dict[str, Any]]:
    if not session:
        return None
    newest: Optional[Dict[str, Any]] = None
    store = CLAUDE_DIR / "plugins" / "store"
    for path in glob.glob(str(store / "jev-mod*.json")) + glob.glob(str(store / "jev-router*.json")):
        entry = (read_json(Path(path)).get("sessions") or {}).get(session)
        if isinstance(entry, dict) and (newest is None or (entry.get("at") or 0) > (newest.get("at") or 0)):
            newest = entry
    return newest


def short_model(model: Optional[str]) -> Optional[str]:
    if not model:
        return None
    name = model.replace("claude-", "")
    for family in ("haiku", "sonnet", "opus"):
        if name.startswith(family):
            version = name[len(family) + 1:].split("-")
            return family + (" " + ".".join(v for v in version[:2] if v.isdigit()) if version and version[0].isdigit() else "")
    return name


def line_jev(data: Dict[str, Any]) -> str:
    record = mod_record(data.get("session_id"))
    parts: List[str] = []
    if record:
        # jev-mod keeps one namespace per feature; the older jev-router record is flat.
        features = record.get("features") or {}
        routing = features.get("routing") or record
        skills = features.get("skills") or record
        screening = features.get("screening") or record
        lane = routing.get("lane") or (routing.get("previous") or {}).get("lane")
        decided = [x for x in (lane, short_model(routing.get("lastModel")), routing.get("effort")) if x]
        parts.append("🧭 " + c("jev", CYAN) + (" " + " · ".join(decided) if decided else ""))
        if skills.get("skill"):
            parts.append(f"🎯 {skills['skill']}")
        if screening.get("withheld"):
            parts.append("🛡 " + c(f"withheld {screening['withheld']}", RED))
    else:
        state = read_json(jev_config_dir() / "state.json")
        hooks = " · ".join(f"{name} {state.get('hook_' + name, 'off')}" for name in ("skills", "screen"))
        parts.append("🧭 " + c("jev", CYAN) + c(" no mod in this session", DIM))
        parts.append(f"hooks {hooks}")
    parts.append(c(f"🔌 {backend_name()}", DIM))
    return SEP.join(parts)


def main() -> int:
    raw = sys.stdin.read()
    try:
        data = json.loads(raw) if raw.strip() else {}
        data = data if isinstance(data, dict) else {}
    except ValueError:
        data = {}
    side_files(raw, data)
    lines = []
    for build in (line_one, line_usage, line_jev):
        try:
            lines.append(build(data))
        except Exception:  # noqa: BLE001 - a status line never errors
            lines.append("")
    sys.stdout.write("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
