---
name: api-endpoint-add
description: Add a new HTTP API endpoint: route, handler, request validation, response envelope and the matching tests.
---

# New endpoint

Handlers live in `app/handlers/`, one function per route, returning `{"data": ..., "error": null}`
or `{"data": null, "error": {"code": ..., "message": ...}}` with the code of a `HarborError`.
Validate the body before touching the database. Add a test per success and per error path.
