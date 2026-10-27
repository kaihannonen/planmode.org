# Plan: Next.js feature slice

**Goal:** add one vertical feature (a page, its data access, and its states) without
touching unrelated routes.

## Preconditions

- `npm run typecheck` and `npm run lint` pass before you start.
- You know which route segment the feature belongs to.

## Steps

1. **Create the segment** at `app/<segment>/page.tsx`. Server Component by default.
2. **Add the data access** in `lib/<domain>.ts`. Keep it server-only; no `"use client"`
   in this file or anything it imports.
3. **Render the states.** Add `loading.tsx` and `error.tsx` next to the page. Do not
   put spinners inside the page component.
4. **Extract interactive leaves.** Any component using `useState`, `useEffect` or an
   event handler gets `"use client"` and lives in `components/<domain>/`.
5. **Add metadata** with `export const metadata` or `generateMetadata`.
6. **Handle empty and error data** explicitly — an empty list is a designed state,
   not a fallback.
7. **Write one test** for the interactive leaf and one for the data mapper.

## Verification

```sh
npm run typecheck
npm run lint
npm run build
npm test
```

Confirm the page streams: the loading state should appear before the data resolves.

## Rollback

Delete the new segment directory and its `components/<domain>/` folder. If a shared
`lib/<domain>.ts` was extended, revert only the added exports.
