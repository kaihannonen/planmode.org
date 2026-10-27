# Frontend testing

Applies to `*.test.tsx` and `*.test.ts`.

## Rules

1. **Test behaviour, not implementation.** Query by role and label, not by class
   name or component internals.
2. **One test file per component**, colocated next to it.
3. **No snapshot-only tests.** A snapshot that nobody reads fails on every cosmetic
   change and catches nothing.
4. **Mock the network, not the module.** Use MSW so the component exercises its real
   fetch path.
5. **Every test states one behaviour** in its name: `shows an error when the request
   fails`, not `renders correctly`.
6. **No arbitrary waits.** Use `findBy*` and `waitFor`; `setTimeout` in a test is a
   flake with a delay.
7. **Cover the unhappy path.** Empty state, loading state, error state — at least one
   test each for a data-driven component.
8. **Accessibility is testable.** If a control cannot be found by role, that is a bug
   in the component, not in the test.

## What not to test

- Third-party component internals.
- Exact CSS values.
- Implementation details that a refactor would legitimately change.
