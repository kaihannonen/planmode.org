# Plan: Django feature

**Goal:** add one Django app slice with a model, a migration, a view and tests.

## Preconditions

- `python manage.py check` is clean and `pytest` passes.
- No unapplied migrations (`makemigrations --check --dry-run`).

## Steps

1. **App** via `python manage.py startapp <name>` if it does not exist; add it to
   `INSTALLED_APPS`.
2. **Model** with explicit `related_name`, `__str__`, and a `Meta` ordering that
   matches how it is queried.
3. **Migration** with `makemigrations`. Read it: check indexes and `on_delete`.
4. **Service** in `services/<name>.py` for anything beyond a single queryset call.
5. **View** — class-based if it maps to CRUD, function-based otherwise. Thin.
6. **Query discipline**: `select_related` / `prefetch_related` on every list view.
7. **Template or serializer** with explicit fields; never `__all__` on a serializer
   that touches user data.
8. **Admin** registration with `list_display` and `search_fields`.
9. **Tests** with `pytest-django`: model invariant, view permission, and the N+1 case
   using `django_assert_num_queries`.

## Verification

```sh
python manage.py check
python manage.py makemigrations --check --dry-run
pytest
```

## Rollback

`python manage.py migrate <app> <previous>` then remove the app from
`INSTALLED_APPS` and delete the directory. Never edit the applied migration.
