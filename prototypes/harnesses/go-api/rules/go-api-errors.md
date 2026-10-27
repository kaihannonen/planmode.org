# Go API errors

Applies to `internal/` in a Go HTTP service.

## Rules

1. **Sentinel errors per domain.** `var ErrUserNotFound = errors.New("user not found")`
   so handlers can branch with `errors.Is`.
2. **Map errors to status codes in one place.** A `respondError(w, err)` helper owns
   the switch. Handlers do not write status codes by hand.
3. **`http.Error` is for infrastructure failures only** — malformed request, body too
   large. Domain failures go through the mapper.
4. **Every handler sets a request id** on the context and includes it in the log line
   and the error response.
5. **Timeouts on every outbound call**, derived from the request context:
   ```go
   ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
   defer cancel()
   ```
6. **Do not leak driver errors.** A `pq` error string can contain the query. Wrap it
   and log the original, return a stable code.
7. **Recover middleware** at the top of the chain, logging the stack and returning
   `500` without the trace.
8. **Response shape is stable**: `{"error":{"code":"...","message":"..."}}`.

## Testing

- `httptest.NewServer` for handler tests.
- One test per status code path, including the wrapped-error case.
