# FastAPI conventions

Applies to `app/` in a FastAPI service.

## Rules

1. **One router per domain.** `users`, `billing`, `auth`. Register them in
   `app/main.py` with a prefix and tags.
2. **Pydantic models at the boundary.** Request and response models are separate from
   SQLAlchemy models. Never return an ORM object directly.
3. **`response_model` on every route.** It documents the contract and strips fields
   you did not mean to expose.
4. **Dependencies for shared resources.** The database session, current user and
   settings arrive through `Depends`, not module-level globals.
5. **No business logic in routes.** A route validates input, calls a service, and
   returns. Anything longer than ten lines belongs in a service function.
6. **Explicit status codes** with `status_code=` on the decorator.
7. **Async all the way down** or sync all the way down. Do not call a blocking driver
   from an `async def` route; it stalls the event loop.
8. **Errors are raised, not returned.** Raise `HTTPException` or a custom exception
   with a handler; do not return `{"error": ...}` with status 200.
9. **Settings via `pydantic-settings`**, loaded from the environment, validated at
   startup.

## Layout

```
app/
  main.py
  api/routes/users.py
  models/user.py
  schemas/user.py
  services/user_service.py
  db/session.py
```
