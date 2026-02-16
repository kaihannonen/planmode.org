# TypeScript Strict Rules

## Compiler settings

Always use the strictest TypeScript compiler settings. The `tsconfig.json` must include:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "exactOptionalPropertyTypes": true
  }
}
```

## Type safety rules

- Never use `any`. Use `unknown` when the type is truly unknown, then narrow with type guards.
- Never use `@ts-ignore`. Use `@ts-expect-error` with a comment explaining why, and only as a last resort.
- Never use non-null assertions (`!`) unless you can prove the value is non-null. Prefer optional chaining (`?.`) and nullish coalescing (`??`).
- Always explicitly type function return values for exported functions. Inferred types are fine for local/private functions.
- Use `readonly` for arrays and objects that should not be mutated. Prefer `ReadonlyArray<T>` over `T[]` for function parameters.
- Use `as const` for literal values and configuration objects.

## Naming conventions

- Interfaces: PascalCase, no `I` prefix (use `User`, not `IUser`)
- Types: PascalCase (e.g., `UserRole`, `ApiResponse`)
- Enums: PascalCase for the enum, PascalCase for members (e.g., `enum Status { Active, Inactive }`)
- Constants: UPPER_SNAKE_CASE for true constants, camelCase for derived values
- Generic type parameters: single uppercase letter for simple cases (`T`, `K`, `V`), descriptive PascalCase for complex cases (`TResponse`, `TInput`)

## Import rules

- Use named imports over default imports where possible.
- Use `import type` for type-only imports.
- Organize imports in groups: external packages, internal modules, relative imports, type imports.

## Error handling

- Define custom error types that extend `Error` for domain-specific errors.
- Use discriminated unions for result types instead of throwing exceptions in business logic.
- Always handle promise rejections. Never leave `.catch()` empty.

## Function signatures

- Prefer object parameters for functions with more than 2 parameters.
- Use overloads only when the return type depends on the input type. Prefer union types otherwise.
- Avoid optional parameters in the middle of a parameter list. Group optionals at the end or use an options object.
