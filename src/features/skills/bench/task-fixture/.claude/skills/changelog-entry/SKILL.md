---
name: changelog-entry
description: Add an entry to CHANGELOG.md for a merged change. Use when asked to "add a changelog entry", "note this in the changelog" or record a PR in the Unreleased section.
---

# Changelog entry

Entries go under `## [Unreleased]` in CHANGELOG.md, in the section that fits the change:

- `### Added`, `### Changed`, `### Fixed` for behaviour users see.
- `### Operator notes` for anything an operator must know before deploying: a changed default,
  a new or renamed config key, a changed limit, a new environment variable. A change to a default
  is always an Operator note, even when it also fixes something. Do not also list it under Changed.

Line format, one line, no trailing full stop:

    * **<area>** — <what changed, with old and new values for a default> (#<pr number>)

The area is one lowercase word (`webhooks`, `orders`, `refunds`, `queue`, `inventory`). The dash is
an em dash with a space on each side. Never touch released sections.
