# Rust strict

Applies to every `.rs` file.

## Rules

1. **No `unwrap()` or `expect()` in library code.** Tests may use them. In `main`,
   `expect` is acceptable only with a message that names the failed assumption.
2. **Propagate with `?`.** If a function cannot handle an error, return it.
3. **`thiserror` for libraries, `anyhow` for binaries.** Do not leak `anyhow` into a
   public API.
4. **No `unsafe` without a `// SAFETY:` comment** explaining the invariant that makes
   it sound.
5. **Clippy clean** with `-D warnings`. Allow a lint only with a comment saying why.
6. **Prefer borrowing in signatures.** Take `&str` rather than `String`, `&[T]`
   rather than `Vec<T>`, unless ownership is required.
7. **Derive the obvious traits**: `Debug` on public types, `Clone` and `PartialEq`
   only when they are actually needed.
8. **No `clone()` to escape the borrow checker** without a comment. Usually the
   shape is wrong.

## Error handling

- One error enum per crate, with `#[from]` conversions for dependencies.
- Add context at the boundary where the error crosses a module.
- Exit codes: `0` success, `1` runtime failure, `2` usage error.
