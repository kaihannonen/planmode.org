# Plan: Go API scaffold

**Goal:** stand up a Go HTTP service with routing, a database, and a health check,
without inventing a layout per project.

## Preconditions

- Go 1.23+ installed.
- A Postgres URL available in `DATABASE_URL`.

## Steps

1. **Module and layout.**
   ```
   cmd/api/main.go
   internal/http/{router,handlers,errors}.go
   internal/store/{store,users}.go
   internal/config/config.go
   migrations/
   ```
2. **Config from env**, validated at startup. Fail fast with a readable message if
   `DATABASE_URL` is missing.
3. **Router** with `chi`, request id and recover middleware, and a `/healthz` that
   pings the database with a 2s timeout.
4. **Store layer** with `pgx`. Every query takes `ctx` and returns wrapped errors.
5. **Error mapper** in `internal/http/errors.go`. Handlers call `respondError`.
6. **One example resource** (`users`) with list and get, to prove the wiring.
7. **Migration** for the example table, timestamped, with an index on the lookup
   column.
8. **Tests**: handler tests with `httptest`, store tests behind a build tag.

## Verification

```sh
go build ./...
go vet ./...
go test ./...
```

Then `curl localhost:8080/healthz` and expect `200` with a database check.

## Rollback

The scaffold is additive. Delete `cmd/` and `internal/` if the project was empty;
otherwise revert the router registration only.
