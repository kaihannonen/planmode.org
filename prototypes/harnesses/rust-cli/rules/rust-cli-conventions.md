# Rust CLI conventions

Applies to binaries built with `clap`.

## Rules

1. **`clap` derive, one struct per command.** The help text is the contract; write it
   for someone who has never seen the tool.
2. **Every flag has a long form and a doc comment.** `#[arg(long, help = "...")]`.
3. **Exit codes are stable**: `0` success, `1` runtime failure, `2` usage error.
   Scripts depend on this.
4. **Errors go to stderr, results to stdout.** A pipeline that consumes stdout must
   not receive log lines.
5. **No interactive prompts when stdin is not a TTY.** Fail with a clear message and
   suggest the flag that would have answered it.
6. **`--dry-run` on anything destructive.** Print the plan, change nothing.
7. **`--json` for machine output.** One object per line or one array; never a mix of
   prose and JSON on the same stream.
8. **`anyhow` at the top level only.** `main` returns `anyhow::Result<()>` and maps
   the error to an exit code in one place.
9. **No `unwrap()` outside tests.** Use `?` or `expect` with a message naming the
   invariant.

## Help output

```
Usage: tool <COMMAND>

Commands:
  add     Add an entry
  verify  Check the entries

Options:
  -h, --help     Print help
  -V, --version  Print version
```
