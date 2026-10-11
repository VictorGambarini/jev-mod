---
name: dependency-upgrade
description: Upgrade a third-party dependency safely: read the changelog, bump the pin, run the tests and record it in docs/deps.md.
---

# Dependency upgrade

The project is standard-library only, so this applies to dev tools and the occasional approved
dependency. Read the upstream changelog, bump the pin in `requirements-dev.txt`, run the full
tests, and add a line to `docs/deps.md` with the version and the reason.
