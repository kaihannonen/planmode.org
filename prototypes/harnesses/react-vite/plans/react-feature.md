# Plan: React feature

**Goal:** add a feature to a Vite SPA with its data fetching, states, and tests.

## Preconditions

- `npm run typecheck`, `npm run lint` and `npm test` pass.

## Steps

1. **Route** in `src/routes/` (or `src/pages/`), lazy-loaded if the bundle is already
   large.
2. **Data hook** in `src/features/<domain>/use<Domain>.ts`, built on the query library.
   No `useEffect` fetching.
3. **Components** in `src/features/<domain>/components/`. Presentational components
   take props; the container owns the hook.
4. **States**: loading, empty, error, success. Each one rendered deliberately, not as
   a ternary chain at the bottom of the file.
5. **Accessibility**: every interactive element is a `button` or a link, labelled.
6. **Tests** colocated: one for the container's states, one for the presentational
   component's interactions.
7. **No global state** unless two unrelated routes need the same value.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Check the built bundle for an unexpected size jump; a new dependency is the usual
cause.

## Rollback

Delete `src/features/<domain>/`, the route entry, and the route registration. Revert
shared types if they were extended.
