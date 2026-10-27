# Plan: FastAPI feature

**Goal:** add one API resource with a schema, a service, and a migration.

## Preconditions

- `uv run pytest` and `uv run mypy app` pass.
- Alembic is configured and `alembic upgrade head` is clean.

## Steps

1. **Schema** in `app/schemas/<resource>.py`: `Create`, `Update` and `Read` models.
   `Read` has `model_config = ConfigDict(from_attributes=True)`.
2. **Model** in `app/models/<resource>.py`, with `created_at` / `updated_at` as
   timezone-aware columns.
3. **Migration** with `alembic revision --autogenerate -m "add <resource>"`. Read the
   generated file — autogenerate misses indexes and server defaults.
4. **Service** in `app/services/<resource>_service.py`. It owns the transaction and
   raises domain exceptions.
5. **Router** in `app/api/routes/<resource>.py`, with `response_model`, explicit
   `status_code`, and a `Depends(get_session)`.
6. **Register** the router in `app/main.py`.
7. **Tests**: one happy path, one validation error, one not-found, using
   `TestClient` and a transactional database fixture.

## Verification

```sh
uv run ruff check .
uv run mypy app
uv run pytest
alembic upgrade head && alembic downgrade -1 && alembic upgrade head
```

The downgrade check catches a migration that cannot be reversed.

## Rollback

`alembic downgrade -1`, then delete the route, service, schema and model files.
