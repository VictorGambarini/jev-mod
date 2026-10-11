---
name: feature-flag
description: Add a feature flag to config/flags.toml for gating a new feature, with owner, default and sunset date.
---

# Feature flag

Never edit config/flags.toml by hand. Each flag carries a checksum, and a hand-written entry fails
the check in CI.

1. `python3 scripts/new_flag.py <name> <owner-team>` (name in snake_case; add `--default true`
   only if the feature is already live).
2. `python3 scripts/check_flags.py` must print `ok`.

The script sets the sunset date 90 days out; a flag is removed by its sunset.
