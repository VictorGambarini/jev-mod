---
name: error-code
description: Add a new service error with a stable HV-<DOMAIN>-<NNNN> code to app/errors.py and docs/error-codes.md.
---

# New error code

1. Pick the domain from its range (GEN 00xx, PAY 01xx, INV 02xx).
2. The number is one above the highest ever used in that domain, counting both
   `docs/error-codes.md` and `docs/error-codes-retired.md`. A retired code is never reused.
3. Add the class to `app/errors.py` (subclass `HarborError`, set `code` and `http_status`).
4. Add its row to `docs/error-codes.md` as `| HV-PAY-0107 | ClassName | meaning |`, in code order.
5. `python3 scripts/check_error_codes.py` must print `ok`.
