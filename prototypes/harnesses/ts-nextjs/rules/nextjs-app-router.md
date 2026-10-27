# Next.js App Router

Applies to `app/` and every route segment inside it.

## Rules

1. **Server Components are the default.** Add `"use client"` only to the smallest
   leaf that needs state, effects, or browser APIs. A page-level `"use client"` is a
   bug: it throws away streaming and server data access.
2. **Fetch on the server.** Call the data layer directly from a Server Component.
   Do not build a `useEffect` fetch for data that could have been read on the server.
3. **Route handlers live at `app/<segment>/route.ts`**, export named `GET`, `POST`
   and friends, and return `Response` or `NextResponse`.
4. **No secrets in client components.** Anything under a `"use client"` boundary is
   shipped to the browser. `process.env.SECRET` belongs in a server file only.
5. **Use `next/link` and `next/image`.** Plain `<a>` and `<img>` lose prefetching
   and image optimisation.
6. **Metadata is exported, not rendered.** Use `export const metadata` or
   `generateMetadata`; do not hand-write `<meta>` tags.
7. **Loading and error states are files.** `loading.tsx` and `error.tsx` per segment,
   not conditional spinners inside the page.
8. **Cache deliberately.** If a fetch is dynamic, say so with
   `export const dynamic = "force-dynamic"` or `revalidate`. Do not rely on defaults
   you have not checked.

## Layout

```
app/
  (marketing)/page.tsx
  dashboard/
    page.tsx
    loading.tsx
    error.tsx
  api/users/route.ts
```
