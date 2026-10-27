# Go strict

Applies to every `.go` file.

## Rules

1. **Wrap errors with `%w`.** `fmt.Errorf("load user: %w", err)` keeps the chain
   inspectable with `errors.Is` and `errors.As`.
2. **No `panic` outside `main` and tests.** Return an error. A library that panics
   takes the process down for a caller it has never met.
3. **`context.Context` is the first parameter**, named `ctx`, and never stored in a
   struct.
4. **Every outbound call takes a timeout.** HTTP, SQL, gRPC. A call without a
   deadline is an outage waiting for a slow dependency.
5. **Accept interfaces, return structs.** Define the interface where it is consumed,
   not where it is implemented.
6. **No package stutter.** `user.User` is worse than `user.Account`; `user.New` is
   better than `user.NewUser`.
7. **Errors are values, not strings.** Sentinel errors or typed errors per domain so
   callers can branch without matching text.
8. **`golangci-lint` clean**, with `errcheck`, `govet`, `staticcheck` and
   `ineffassign` enabled.
9. **Table-driven tests** with `t.Run` subtests and `t.Parallel()` where the test is
   independent.

## Avoid

- `init()` for anything that can fail.
- Global mutable state.
- `interface{}` / `any` in public signatures.
