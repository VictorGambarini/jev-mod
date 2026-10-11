---
name: schema-docs
description: Document the database schema: tables, columns, indexes and relationships, kept in docs/schema.md.
---

# Schema docs

After a schema change, update `docs/schema.md`: one section per table with a column table
(name, type, nullable, meaning) and a list of indexes. Generate the diagram with `make schema`.
This documents the schema as it is; it does not create migrations.
