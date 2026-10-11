# db

Migrations live in db/migrations and apply in file-name order. `make check` runs `python3 tools/migrate.py --dry-run`, which applies them to an empty database.
