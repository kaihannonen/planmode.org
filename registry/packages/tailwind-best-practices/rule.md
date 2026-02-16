# Tailwind CSS Best Practices

## Utility-first approach

- Always use Tailwind utility classes directly in markup. Avoid writing custom CSS unless absolutely necessary.
- When a set of utilities is repeated across many components, extract it into a reusable component (React/Vue/Svelte component), not into a CSS class with `@apply`.
- Reserve `@apply` for base styles on plain HTML elements in global CSS (e.g., styling `<a>` tags in prose content).

## Class ordering

Follow a consistent ordering of utility classes. Recommended order:

1. Layout (display, position, overflow)
2. Flexbox/Grid (flex, grid, gap, items, justify)
3. Spacing (margin, padding)
4. Sizing (width, height, min/max)
5. Typography (font, text, leading, tracking)
6. Backgrounds and borders (bg, border, rounded, shadow)
7. Effects and transitions (opacity, transition, transform)
8. State variants (hover, focus, active) last

Use the `prettier-plugin-tailwindcss` plugin to auto-sort classes.

## Responsive design

- Always design mobile-first. Start with the base (mobile) styles and add breakpoint prefixes (`sm:`, `md:`, `lg:`, `xl:`) for larger screens.
- Never use arbitrary breakpoints. Stick to Tailwind's default breakpoint scale unless the design system requires custom ones.
- Test all layouts at 320px, 768px, 1024px, and 1280px minimum.

## Color and theming

- Define all project colors in `tailwind.config.ts` under `theme.extend.colors`. Never use arbitrary color values (e.g., `bg-[#ff5533]`) in components.
- Use semantic color names (e.g., `primary`, `secondary`, `danger`, `success`) instead of raw color names.
- For dark mode, use the `dark:` variant with a consistent color mapping.

## Component patterns

- Keep utility strings readable. If a class list exceeds approximately 10 utilities, consider breaking it across multiple lines or extracting a component.
- Use `cn()` or `clsx()` for conditional classes. Never concatenate strings manually for dynamic classes.
- Always set explicit `ring` and `outline` styles on interactive elements for keyboard accessibility.

## Performance

- Avoid dynamic class construction (e.g., `` `text-${color}-500` ``). Tailwind's purge cannot detect dynamically constructed classes. Use complete class strings or a safelist.
- Keep the Tailwind config content paths accurate to minimize CSS bundle size.
- Use Tailwind's JIT mode (default in v3+) and avoid disabling it.

## Spacing and sizing

- Use Tailwind's spacing scale consistently. Avoid mixing rem-based utilities with pixel-based arbitrary values.
- Prefer `gap` over individual margin utilities for flex and grid layouts.
- Use `max-w-prose` or `max-w-screen-*` for readable content widths. Never let text lines exceed approximately 75 characters.
