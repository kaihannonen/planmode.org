# Postgres migrations

Applies to any migration directory (`migrations/`, `db/migrations/`, `alembic/versions/`).

## Rules

1. **Migrations are append-only.** Never edit a migration that has run anywhere.
   Fix forward with a new one.
2. **One logical change per migration.** A table plus its index plus a backfill is
   three migrations, not one.
3. **Every foreign key gets an index.** Postgres does not create one for you, and
   the missing index only shows up under load.
4. **`timestamptz`, not `timestamp`.** Store UTC, convert at the edge.
5. **`text` with a `CHECK` constraint** instead of `varchar(n)` unless the limit is
   a real domain rule.
6. **Destructive changes need three steps:** add the new shape, backfill, then drop
   the old one in a later migration. Never drop a column and its reader in the same
   deploy.
7. **Name files `YYYYMMDDHHMMSS_description`** in snake case, so ordering is stable
   across tools.
8. **Every migration is reversible or explicitly marked irreversible.** If it
   cannot be reversed, say why in a comment at the top.

## Review checklist

- Does it lock a large table? (`ALTER TABLE ... ADD COLUMN ... DEFAULT`)
- Does it rewrite a table? (`ALTER COLUMN TYPE`)
- Does it need `CONCURRENTLY`, and is it outside a transaction?
