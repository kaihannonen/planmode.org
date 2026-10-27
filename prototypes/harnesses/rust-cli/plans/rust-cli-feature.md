# Plan: Rust CLI feature

**Goal:** add one subcommand with typed arguments, stable exit codes and tests.

## Preconditions

- `cargo test` and `cargo clippy -- -D warnings` pass.

## Steps

1. **Args struct** in `src/cli.rs`, deriving `clap::Args`, with a doc comment on every
   field so `--help` is useful.
2. **Command variant** added to the top-level `Command` enum.
3. **Implementation** in `src/commands/<name>.rs`. Take `&Args` and a writer for
   output, so tests can capture stdout.
4. **Errors** are a `thiserror` enum in the module. Convert to `anyhow` only in
   `main`.
5. **Exit codes**: return a typed error and map it once in `main` — `2` for usage,
   `1` for runtime.
6. **`--dry-run`** if the command writes or deletes anything.
7. **`--json`** if the output is likely to be scripted.
8. **Tests**: `assert_cmd` for the CLI surface, unit tests for the pure logic.

## Verification

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

Then check the contract by hand:

```sh
cargo run -- <command> --help
cargo run -- <command> --json | jq .
echo $?   # expect 0, and 2 for a bad flag
```

## Rollback

Remove the command variant and its module. The CLI surface is the only public API;
nothing else depends on it.
