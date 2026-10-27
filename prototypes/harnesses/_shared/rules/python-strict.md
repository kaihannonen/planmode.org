# Python strict

Applies to every `.py` file.

## Rules

1. **Type hints on every public function**, including return types. `mypy --strict`
   should pass on the package you own.
2. **No mutable default arguments.** `def f(items: list[str] = [])` shares one list
   across calls. Use `None` and build inside.
3. **No bare `except:`** and no `except Exception: pass`. Catch the narrowest type
   you can handle, and let everything else propagate.
4. **`pathlib` over `os.path`.** `Path(__file__).parent` beats string joins.
5. **f-strings only.** No `%` formatting and no `.format()` in new code.
6. **Keyword-only for anything with more than two parameters** where the call site
   would otherwise be ambiguous.
7. **No wildcard imports.** `from module import *` hides dependencies and breaks
   static analysis.
8. **Dataclasses or Pydantic for structured data.** No bare dicts passed between
   layers.
9. **Time is timezone-aware.** `datetime.now(timezone.utc)`, never `datetime.now()`.

## Tooling this assumes

`ruff` for lint and format, `mypy` for types, `pytest` for tests.
