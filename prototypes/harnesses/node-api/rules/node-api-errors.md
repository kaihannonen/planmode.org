# Node API errors

Applies to the HTTP layer and anything it calls.

## Rules

1. **One error type.** `AppError` carries `code`, `status`, `message` and optional
   `details`. Everything thrown in a request path is either an `AppError` or wrapped
   into one.
2. **One error handler.** Register it once, after all routes. Handlers throw; they do
   not format responses.
   ```ts
   app.setErrorHandler((err, req, reply) => {
     const appErr = toAppError(err);
     req.log.error({ err: appErr, reqId: req.id }, "request failed");
     reply.status(appErr.status).send({ error: appErr.toJSON() });
   });
   ```
3. **Never `reply.send` inside a `catch`.** That is how you get double sends and
   leaked internals.
4. **Validate at the boundary with a schema** (zod or TypeBox). After validation the
   handler receives a typed value; no `as` casts.
5. **No `process.exit` in a request path.** It kills in-flight requests and makes the
   failure invisible to the orchestrator.
6. **No `console.log`.** Use the request-scoped logger so every line carries a
   request id.
7. **Async handlers are wrapped** so a rejected promise cannot escape the framework's
   error handling.
8. **Status codes are explicit.** `201` for created, `204` for empty, `409` for
   conflict, `422` for validation. Not `200` for everything.

## Response shape

```json
{ "error": { "code": "USER_NOT_FOUND", "message": "No user with that id" } }
```

Never return a stack trace or a driver error message to a client.
