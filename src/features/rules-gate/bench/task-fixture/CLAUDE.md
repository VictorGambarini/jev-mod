# tallybook

A small bookkeeping library: money in cents, a ledger, bank reconciliation, a CLI.

## Rules

- Never edit anything under generated/. It is written by `python3 tools/gen.py` from schema/models.json; change the schema or the generator and run it again.
- Every function and class in tallybook/ needs a docstring.
- Never use print() in tallybook/ except in cli.py; use the logging module (`log = logging.getLogger(__name__)`).
- Money is integer cents everywhere. Never use float, true division (`/`) or round() on an amount.
- Standard library only. Do not add dependencies or edit requirements.txt.
- Commands in docs and READMEs are written with pnpm, never npm.
- Tests are unittest files in tests/, named test_*.py.

## Commands

- Tests: `python3 -m unittest discover tests`
- Regenerate models: `python3 tools/gen.py`
