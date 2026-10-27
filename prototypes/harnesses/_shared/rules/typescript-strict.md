# TypeScript strict

Applies to every `.ts` and `.tsx` file.

## Rules

1. **No `any`.** Use `unknown` at the boundary and narrow it with a type guard or a
   schema parser. `any` switches the compiler off exactly where the data is least
   trustworthy.
2. **No non-null assertions (`!`).** If a value can be absent, model it as
   `T | undefined` and handle the branch. `!` is a runtime crash waiting for a
   refactor.
3. **Assertions need evidence.** `as Foo` is allowed only after the shape has been
   validated. Never use it to silence an error you do not understand.
4. **Exhaustive unions.** End every `switch` over a union with a `default` that
   assigns to `never`, so adding a variant becomes a compile error:

   ```ts
   default: {
     const _exhaustive: never = value;
     return _exhaustive;
   }
   ```

5. **`type` for unions, `interface` for object shapes.** Do not mix the two in the
   same file for the same concept.
6. **`satisfies` over annotation** when you want a value checked without widening
   its inferred type.
7. **No enums.** Prefer `as const` objects plus a derived union; enums generate
   runtime code and do not narrow well across packages.

## Compiler settings this assumes

`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`.
