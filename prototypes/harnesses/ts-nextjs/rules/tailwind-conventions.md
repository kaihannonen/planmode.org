# Tailwind conventions

Applies to every component with `className`.

## Rules

1. **Tokens over arbitrary values.** `bg-primary` beats `bg-[#1a1a1a]`. If a value is
   missing from the theme, add it to the theme instead of inlining it.
2. **Compose with `cn()`.** Conditional classes go through the `clsx` + `tailwind-merge`
   helper so conflicting utilities resolve predictably.
   ```tsx
   <div className={cn("p-4", isActive && "bg-accent")} />
   ```
3. **Mobile first.** Base classes are the small screen; add `sm:`, `md:`, `lg:` to
   grow. Never write desktop-first with `max-*` overrides.
4. **No inline `style`** except for values that are genuinely dynamic (a computed
   width, a transform driven by drag).
5. **Semantic colour names.** `bg-surface`, `text-muted`, `border-subtle` — not
   `bg-gray-100` scattered through the app.
6. **Extract a component, not a class string.** If the same 12 utilities appear
   twice, make a component.
7. **Focus states are mandatory.** Every interactive element keeps a visible
   `focus-visible` ring.
8. **Dark mode via tokens**, using `dark:` only where a token cannot express the
   difference.
