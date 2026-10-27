# Java strict

Applies to every `.java` file.

## Rules

1. **Constructor injection only.** No field injection with `@Autowired`. A field
   injection hides a dependency and makes the class untestable without a container.
2. **`record` for DTOs.** Immutable by default, no boilerplate, no accidental
   setters.
3. **`Optional` is a return type, never a field or a parameter.** Do not call
   `.get()` without a presence check.
4. **No checked exceptions leaking out of the service layer.** Translate to a domain
   exception at the boundary.
5. **Immutability by default.** `final` fields, unmodifiable collections, no setters
   unless a framework requires them.
6. **No `System.out`.** Use the logging facade; `System.out` bypasses levels and
   structured fields.
7. **Nullability is documented** with `@Nullable` / `@NonNull` where the type system
   cannot express it.
8. **No wildcard imports.** Explicit imports keep review diffs readable.

## Testing

- JUnit 5 with `@Nested` for grouping.
- AssertJ assertions, not `assertEquals` with swapped arguments.
- No `Thread.sleep` in tests; use Awaitility.
