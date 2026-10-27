# React hooks

Applies to every component in `src/`.

## Rules

1. **Hooks at the top level.** Never inside a condition, a loop, or a callback.
2. **Complete dependency arrays.** If a value is used, it is listed. If listing it
   causes a loop, the effect is wrong — not the linter.
3. **No derived state in an effect.** If a value can be computed from props or state
   during render, compute it. `useEffect` + `setState` for a derived value causes an
   extra render and a stale frame.
4. **`useMemo` and `useCallback` only with a measured reason.** Wrapping everything
   costs more than it saves.
5. **Server state belongs to a query library**, not to `useEffect`. Local UI state
   stays in `useState` / `useReducer`.
6. **Effects are for synchronising with the outside world** — subscriptions, DOM,
   timers, analytics. Not for data flow inside React.
7. **Clean up every subscription.** Return the teardown from the effect; do not rely
   on unmount timing.
8. **Keys are stable ids**, never array indexes for a list that can reorder.
9. **Custom hooks start with `use`** and return a tuple or a named object, never a
   bare array of unrelated values.
