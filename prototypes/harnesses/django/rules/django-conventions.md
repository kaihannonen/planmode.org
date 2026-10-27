# Django conventions

Applies to every Django app.

## Rules

1. **Thin views, explicit services.** A view validates input, calls a service, and
   renders. Query logic does not live in the view.
2. **Avoid N+1 queries.** Use `select_related` for foreign keys and
   `prefetch_related` for many-to-many before the queryset reaches the template.
3. **Custom user model from day one.** Swapping `AUTH_USER_MODEL` after migrations
   exist is painful; do it before the first migration.
4. **Settings are environment-driven.** No secrets or hostnames in `settings.py`;
   read them with `os.environ` through a typed settings object.
5. **No raw SQL without parameters.** If you must use `cursor.execute`, pass
   parameters — never interpolate.
6. **Migrations are committed** and reviewed like code. `makemigrations --check` runs
   in CI.
7. **Model methods for invariants.** `clean()` and `save()` enforce rules that must
   hold regardless of which view wrote the row.
8. **Explicit `related_name`** on every FK and M2M; the default `<model>_set` breaks
   the moment two apps collide.
9. **Transactions at the service boundary**, using `transaction.atomic`.

## Testing

- `pytest-django` with `@pytest.mark.django_db`.
- Factories (`factory_boy`) over hand-built fixtures.
- Assert on responses and database state, not on mock call order.
