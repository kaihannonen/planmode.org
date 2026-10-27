# Plan: Node API endpoint

**Goal:** add one resource endpoint with validation, a service call, and error mapping.

## Preconditions

- The server boots and `npm test` passes.
- A `routes/` (or `src/routes/`) directory exists.

## Steps

1. **Define the schema** with zod in `schemas/<resource>.ts`. Export the inferred type
   so the handler has no casts.
2. **Write the service** in `services/<resource>.ts`. It takes validated input and
   returns a domain object. It throws `AppError` for expected failures.
3. **Write the route** in `routes/<resource>.ts`. Validate the body, call the service,
   set an explicit status code, return the response model.
4. **Register the route** in the server setup with a prefix.
5. **Map errors** — do not catch in the route unless you are converting to a domain
   error. The global handler formats the response.
6. **Log once**, in the handler, with the request id. No `console.log`.
7. **Test the three paths**: success, validation failure, not found.

## Verification

```sh
npm run typecheck
npm test
```

Then exercise it:

```sh
curl -i -X POST localhost:3000/api/<resource> \
  -H 'content-type: application/json' \
  -d '{"name":""}'
```

Expect `422` with `{"error":{"code":...}}`, not a stack trace.

## Rollback

Remove the route registration first, then the three files. Nothing else references
them.
