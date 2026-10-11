---
name: adr-new
description: Write a new architecture decision record (ADR) for a technical decision, with its number, file name, index row and required sections.
---

# New ADR

1. Get the number: `python3 scripts/next_adr.py`. It skips numbers reserved in `docs/adr/RESERVED`.
   Do not infer it from the file listing.
2. Create `docs/adr/<number>-<slug>.md` (slug: lowercase words joined by hyphens, at most five).
3. Use exactly this shape:

       # ADR-<number>: <Title>

       - Status: Proposed
       - Deciders: <names or team>

       ## Context
       ## Decision
       ## Consequences
       ## Alternatives considered

   Every new ADR starts as `Proposed`; only the deciders move it to Accepted.
4. Add a row `| <number> | <Title> | Proposed |` to the table in `docs/adr/README.md`.
