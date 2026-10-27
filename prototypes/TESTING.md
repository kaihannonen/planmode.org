# Testing the harness prototypes

Nothing here is published. The goal of this round is to find out whether the harness
manifest is the right shape, and whether the evals say anything true about a real repo.

## 1. Validate the catalog

```sh
node prototypes/validate.mjs
```

Checks every `harness.yaml`: required fields, `type: harness`, semver, known targets,
includes resolve to real non-empty files, eval kinds and regexes are valid, eval names
are unique.

Expected: `OK — 10 harnesses, 0 warnings`.

## 2. Prove the evals discriminate

Two fixtures are deliberately wrong, two are correct.

```sh
# should fail: raw SQL, panic, no timeout, no migrations
node prototypes/run-evals.mjs \
  --harness prototypes/harnesses/go-api \
  --target prototypes/fixtures/go-bad --skip-commands

# should pass
node prototypes/run-evals.mjs \
  --harness prototypes/harnesses/go-api \
  --target prototypes/fixtures/go-good --skip-commands
```

Expected scores: `20/100` and `100/100`.

```sh
node prototypes/run-evals.mjs \
  --harness prototypes/harnesses/node-api \
  --target prototypes/fixtures/node-bad --skip-commands

node prototypes/run-evals.mjs \
  --harness prototypes/harnesses/node-api \
  --target prototypes/fixtures/node-good --skip-commands
```

Expected: `22/100` and `100/100`.

Command evals, including exit codes and stderr capture:

```sh
node prototypes/run-evals.mjs \
  --harness prototypes/fixtures/command \
  --target prototypes/fixtures/command/pass

node prototypes/run-evals.mjs \
  --harness prototypes/fixtures/command \
  --target prototypes/fixtures/command/fail
```

## 3. Run against a real repository

```sh
node prototypes/run-evals.mjs \
  --harness prototypes/harnesses/go-api \
  --target ~/code/some-go-service \
  --report /tmp/report.json
```

Use `--skip-commands` when the stack's toolchain is not installed. Commands that are
missing are reported as `skipped`, not failed.

```sh
node prototypes/run-evals.mjs \
  --harness prototypes/harnesses/ts-nextjs \
  --target ~/code/some-next-app --skip-commands
```

### What to look for

- **False positives.** A rule that passes on a repo you know is messy. That is the
  signal the eval is too weak.
- **False negatives.** A rule that fails on a repo you know is clean. Usually a glob
  or a path that does not match this project's layout.
- **Vacuity.** `— no files matched` means the glob found nothing, so the eval passed
  for the wrong reason.
- **Noise.** Long match lists mean the pattern is too broad; fix the pattern before
  trusting the score.

## 4. Score meaning

`error` counts 1, `warn` counts 0.5. Skipped evals are excluded from the denominator.
A score is only meaningful within one harness; comparing scores across stacks says
nothing.

## Known limitations

- No install pipeline. The manifests describe what would be copied; nothing writes
  files yet.
- `suggests.mcp` is advisory. Nothing resolves or installs MCP servers.
- Grep evals are line-based, so a pattern cannot span lines and will match comments
  and strings. They are guardrails, not static analysis.
- Only the Node fixtures execute commands on this machine. Go, Rust, Java and
  Terraform commands are declared but were not run here.
- The `harness` type is not in the CLI `PackageType` union yet. This prototype is
  deliberately independent of the three open PRs.

## Questions this round should answer

1. Is `includes` + `verification` + `evals` enough, or is a harness missing a section?
2. Are the evals catching real problems on real repos, or mostly noise?
3. Is one plan per harness enough, or does a harness need the full task loop?
4. Does `install golang-api` feel like the right verb, or is `add` clearer?
