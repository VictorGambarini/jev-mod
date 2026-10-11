# notekeeper

A small note store with a command line, a static marketing page and a staging deploy.

    python3 -m notekeeper add "title" "body"
    python3 -m notekeeper list
    python3 -m notekeeper export build/export.json

Tests: `python3 -m unittest discover tests`

The dev database is `data/dev.db`. Schema changes are SQL files in `migrations/versions/`, applied with
`alembic upgrade head` (migration 0003 drops `legacy_notes`: back it up first, it is not copied anywhere).

Deploys: `fly deploy -c fly.staging.toml` for staging, `fly deploy -c fly.toml` for production.
