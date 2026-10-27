# The agent loop: plan → build → verify → fix, with permanent bug guards

Status: adapters, `check`, `guard`, the agent-agnostic loop controller, frozen
contracts, the deterministic diff audit, and an optional semantic reviewer are
implemented. Runtime evidence, AST checks, mutation testing, and cross-client
comparison are still to build.

This document describes the local development loop that should make agent output
trustworthy without requiring a git commit at every step. It also defines how a
bug found during verification becomes a **deterministic guard** so the same class
of bug cannot come back silently.

## Goal

A developer should be able to run a plan through any AI client and get a change
they can trust, with evidence:

- the plan has testable acceptance criteria
- the agent works in an isolated copy, not the main checkout
- the judge runs independently of the builder
- only new failures block the change
- every bug found becomes a permanent, deterministic check
- the result is a one-page proof, not a wall of logs

## Non-goals

- Do not build a universal agent API.
- Do not require hooks, headless mode, or a specific client.
- Do not make an LLM the pass/fail gate.
- Do not auto-edit tests or guards from inside the agent loop.
- Do not require a git commit to test a change.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Portable harness content                                    │
│ harness.yaml · rules/*.md · plans/*.md · evals · guards     │
└──────────────────────────┬──────────────────────────────────┘
                           │ render
             ┌─────────────┼─────────────┬──────────────┐
             ▼             ▼             ▼              ▼
          Claude         Codex        Cursor        OpenCode
         CLAUDE.md      AGENTS.md    .cursor/rules   AGENTS.md
             │             │             │              │
             └─────────────┴──────┬──────┴──────────────┘
                                  │ build
                                  ▼
                    ┌──────────────────────────┐
                    │ Client-independent judge  │
                    │ git diff or base-dir diff │
                    │ commands + evals + guards │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │ Proof bundle + guard      │
                    │ suggestions + ratchet     │
                    └───────────────────────────┘
```

Three rules hold the design together:

1. **Content is portable.** A harness is written once and rendered per client.
2. **The client is a builder, not a judge.** It can produce a working tree; it
   cannot decide whether the tree is acceptable.
3. **The judge is client-independent.** It sees the plan, the diff, and command
   output. The same change gets the same verdict regardless of which AI wrote it.

## Client adapters

Each adapter implements a small interface:

```ts
interface ClientAdapter {
  id: "claude" | "codex" | "cursor" | "opencode";
  capabilities: {
    headless: boolean;
    hooks: boolean;
    transcript: boolean;
    permissions: boolean;
    mcp: boolean;
  };
  instructionFiles(projectDir: string): string[];
  apply(ctx: RenderContext): void;
  remove(ctx: RemoveContext): void;
  check(ctx: RemoveContext): string[];
}
```

| | Claude Code | Codex | Cursor | OpenCode |
|---|---|---|---|---|
| Rules | `CLAUDE.md` imports | `AGENTS.md` section | `.cursor/rules/*.mdc` | `AGENTS.md` section |
| Plans | `@plans/*.md` | `AGENTS.md` link | `.mdc` rule | `AGENTS.md` link |
| Headless | `claude -p` | `codex exec` | manual | `opencode run` |
| Hooks | lifecycle hooks | limited | none | plugins/events |
| Transcript | JSONL | session logs | none | SQLite / server API |
| Permissions | permission modes | sandbox | IDE | `permissions` / `policies` |

**Manual mode is first-class.** If a client has no stable headless entry point,
the developer uses it normally and runs `planmode check`. Every client is
supported on day one; headless launch is an optimization, not a requirement.

Adapters never decide pass/fail. They only render instructions, optionally launch
the agent, and optionally expose a transcript. The judge is the constant.

## The loop

### 0. Preflight

`planmode doctor`-style checks before work starts: toolchain versions, lockfile,
database, ports, env vars. Record an environment fingerprint. A green that cannot
be reproduced is not green.

### 1. Plan hardening → frozen contract

The plan must contain:

- goal and non-goals
- observable acceptance criteria
- touchpoints and scope
- constraints
- verification commands and checks
- risks and rollback

Each criterion maps to a check. Vague criteria are rejected. The contract is
hashed and frozen before coding starts. Changing it requires human approval and a
new hash.

The contract can live in plan frontmatter or in `.planmode/contract.yaml`:

```yaml
---
contract:
  acceptance:
    - criterion: "The API returns 404 for a missing user"
      check: "command:api-tests"
    - criterion: "No console logging in production code"
      check: "no-console-log"
  allowed_paths:
    - "src/**"
    - "tests/**"
  protected_paths:
    - "docs/security/**"
  allow_test_edits: false
  allow_dependency_changes: false
  allow_binary_changes: false
  max_changed_files: 20
  max_changed_lines: 800
---
```

`check` is optional. A criterion with a check is a deterministic gate: the named
check must exist and pass. A criterion without a check is reviewed by the
optional semantic reviewer. Check names are the same names `planmode check`
prints (`no-console-log`, `command:api-tests`,
`guard:prevent-no-raw-sql`).

### 2. Baseline

Run the checks on the base state first. Store the result. This separates:

- pre-existing failures
- flaky failures
- failures caused by this change

Only the third kind goes back to the builder.

### 3. Build in isolation

Use a copy or worktree, never the developer's dirty checkout. Each iteration is a
separate checkpoint, so every attempt can be inspected and reverted. The agent
sees the plan, the harness rules, and the contract — not the judge's internals.

`planmode loop` is the first controller:

- copies the project into a temp workspace, excluding `node_modules`, `.git`,
  build output, and caches; `--link-deps` symlinks dependency directories so
  verification commands can run, and `--workspace` reuses a prepared checkout
- records a baseline check before the builder runs
- freezes the plan hash and contract hash before the first attempt
- invokes any builder command with `$PLANMODE_PROMPT`,
  `$PLANMODE_PROMPT_FILE`, `$PLANMODE_FAILURE_FILE`, and `$PLANMODE_WORKSPACE`
- rechecks against the baseline after every attempt
- runs the diff audit and, optionally, a separate semantic reviewer
- writes a failure packet the next attempt can read
- stops on pass, diff violation, repeated failure, regression, timeout, human
  review, or iteration budget
- leaves the source checkout untouched and prints the workspace path

```sh
# OpenCode
planmode loop --plan plan.md --agent 'opencode run "$PLANMODE_PROMPT"'

# Claude Code
planmode loop --plan plan.md --agent 'claude -p "$PLANMODE_PROMPT"'

# Codex
planmode loop --plan plan.md --agent 'codex exec "$PLANMODE_PROMPT"'

# Add a separate semantic reviewer (optional)
planmode loop --plan plan.md --agent 'opencode run "$PLANMODE_PROMPT"' \
  --judge-agent 'claude -p "$PLANMODE_JUDGE_PROMPT"' \
  --rerun-failures

# Any other tool: claim the prompt and write the change yourself
planmode loop --plan plan.md --agent 'my-agent --prompt-file "$PLANMODE_PROMPT_FILE"'
```

Cursor has no stable headless entry point, so use manual mode: work normally in
Cursor, then run `planmode judge` (or `planmode check` for only the deterministic
gates). The judge is the same.

Protected paths are snapshotted before the builder runs. If any protected file
changes, the loop stops and writes `protected-change.md`. The judge also uses the
source harness and guards, not the workspace copies, so editing the harness
cannot make checks pass. Automatic restore/reject is a later milestone.

### 4. Independent judge

`planmode judge` runs the deterministic gate and the diff audit; the loop runs
the same pieces after each builder attempt. The order is:

1. deterministic gates: typecheck, lint, unit, integration, build, e2e
2. acceptance checks: contract criteria mapped to named checks
3. the permanent guard corpus
4. diff audit: scope, protected files, deleted code, unimplemented stubs,
   TODO/FIXME warnings, test tampering, dependency changes, binary changes,
   added secrets, and size limits
5. failure classification: pre-existing vs new, plus flaky reruns
6. optional semantic review by a separate agent, with evidence

The deterministic judge fails closed. If a required check cannot run, the result
is **unverified**, not pass. A semantic reviewer can pass, fail, or ask for a
human; it never turns a deterministic failure into a pass. A semantic rejection
stops the loop at `needs_human` rather than feeding an LLM opinion back as an
automatic fix target. That keeps the LLM out of the enforcement path.

Run the manual judge against a pristine copy:

```sh
planmode judge --target ./project --base-dir /tmp/project-base \
  --harness ./harness --plan ./plan.md \
  --judge-agent 'claude -p "$PLANMODE_JUDGE_PROMPT"' \
  --report-dir .planmode/runs/judge
```

The semantic reviewer writes JSON to `$PLANMODE_JUDGE_OUTPUT`:

```json
{
  "verdict": "pass",
  "summary": "The change satisfies the contract and stays in scope.",
  "findings": []
}
```

The judge snapshots the workspace before and after the reviewer. If the reviewer
edits files, the result is `needs_human`, not pass.

`--rerun-failures` reruns failed command checks once. A pass on the rerun is
recorded in `flaky` and the proof bundle, so a flaky green is visible rather than
silent.

### 5. Targeted fix

The builder receives a minimal failure packet:

```
FAIL guard:prevent-no-raw-sql
Check:   grep-absent internal/**/*.go '\\.Query\\("'
Expected: no matches
Actual:  1 match at internal/users.go:42
Do not modify: tests/**, .planmode/guards.yaml, .github/**
Already passing: go-module, handler-timeouts
```

The loop stops on:

- a repeated failure signature
- a regression in a previously passing check
- a diff outside the declared scope
- the iteration budget

A loop that always eventually goes green is lying. Stopping is a feature.

### 6. Proof bundle + human gate

Each run writes to `.planmode/runs/<id>/`:

```
report.json          deterministic check report
PROOF.md             one-page check summary
JUDGE.json           combined check, diff, contract, and semantic verdict
JUDGE.md             human-readable judge verdict
DIFF_AUDIT.json/.md  changed files, scope, protected/test/dependency findings
SEMANTIC_PROMPT.md   exact prompt given to the semantic reviewer
SEMANTIC_REVIEW.json normalized semantic review
guards.proposed.yaml deterministic guards derived from failures
logs/                raw command output
```

`PROOF.md` includes the checks that ran, the checks that did not run, and the
residual risk. `JUDGE.md` adds the contract criteria, diff findings, and any
semantic review. The developer reads two short pages; the full trail is there
when they want it.

## Testing without git

The judge must not depend on commits. Three modes are supported today:

```sh
# 1. Full tree, no git
planmode check --harness ./harness --target ./project

# 2. Compare against a pristine copy, no git
planmode check --harness ./harness --target ./project \
  --base-dir /tmp/project-base --changed-only

# 3. Snapshot baseline, no git
planmode check --harness ./harness --target ./project \
  --save-baseline /tmp/project.baseline.json
# ... make changes ...
planmode check --harness ./harness --target ./project \
  --baseline /tmp/project.baseline.json
```

`--base-dir` compares content hashes of two directories. `--baseline` stores file
hashes plus the previous check results, so the report can distinguish new
failures from pre-existing ones. Neither mode runs `git`.

`planmode judge` uses the same `--base-dir` for the diff audit, so manual clients
such as Cursor can work normally and then judge the result against a pristine
copy.

The loop controller uses the same mechanism:

```sh
planmode loop --plan ./plan.md --harness ./harness --target ./project \
  --agent 'opencode run "$PLANMODE_PROMPT"' \
  --report-dir .planmode/loop/latest
```

It copies the project, saves a baseline, and rechecks after each attempt. No
commit, branch, or clean git status is required.

This is also how the tests work: temp directories, no repository, no commits.

## Deterministic bug prevention

The verification loop is only useful if a found bug changes the future. Every
failure is a candidate guard. The rule is:

> **No bug is closed until a deterministic check exists that would have caught it.**

### The flywheel

1. `planmode check` finds a failure.
2. The report contains a proposed guard derived from the failing check — not an
   LLM invention, just a structured transform of the check definition.
3. The developer or loop adds a **bad fixture** that reproduces the bug and a
   **good fixture** that represents correct behavior.
4. `planmode guard add` runs the guard against both:
   - bad must fail
   - good must pass
5. Only a guard that discriminates is written to `.planmode/guards.yaml`.
6. Every `planmode check` runs the guard corpus.
7. `planmode guard verify` reruns the fixtures, so a guard that has become
   vacuous or noisy fails loudly.
8. The guard is permanent. Removing it requires human approval, like removing a
   test.

Every escaped bug adds a guard. The regression surface grows monotonically.

### Choosing the guard

Prefer, in order:

1. **Executable regression test** — a `command` check that reproduces the actual
   behavior. Most trustworthy.
2. **Structural/AST check** — future; catches a code shape without matching
   comments or strings.
3. **Path/glob invariant** — a file or directory must exist.
4. **Grep** — last resort. Line-based, can match comments and strings. Use a
   tight pattern, a narrow path, and a `glob`.

An LLM may help write the test or choose the pattern, but the guard that runs is
deterministic. No LLM in the enforcement path.

### Guard schema

```yaml
version: 1
guards:
  - id: prevent-no-raw-sql
    reason: Raw SQL bypassed parameterisation in a user lookup
    source: bug:2026-10-27-users-sql
    created_at: 2026-10-27T00:00:00.000Z
    severity: error
    check:
      kind: grep-absent
      path: internal
      glob: "**/*.go"
      pattern: '\.Query\("'
    fixtures:
      bad: fixtures/bugs/raw-sql-bad
      good: fixtures/bugs/raw-sql-good
    verified: true
```

The guard is deterministic because:

- it runs the same check on the same input every time
- the fixtures are real directories, checked into the repo
- the bad fixture must fail and the good fixture must pass
- zero matched files is a failure for required checks, never a silent pass
- the guard is protected from agent edits
- `guard verify` detects a guard that stopped discriminating

### What "similar bug" means

A guard should catch the **class**, not the instance. The raw-SQL guard scans the
whole `internal` tree, not one file. A timeout guard requires every handler to
have a timeout, not one handler in fifty. The fixture documents the bug; the
check enforces the invariant.

### Bug records

`.planmode/bugs/<id>.md` is optional but recommended:

```md
# bug:2026-10-27-users-sql

## Symptom
GET /users/:id returned another user's row under load.

## Root cause
Raw SQL built from a request parameter.

## Fix
Parameterised query in internal/users.go.

## Guard
prevent-no-raw-sql
```

The guard links to the record through `source`. The loop can include the record
in the builder's context, but the guard is what prevents recurrence.

## What is implemented now

- `cli/src/lib/clients/` — Claude Code, Codex, Cursor and OpenCode adapters.
- `planmode install --target claude,codex,cursor,opencode` — renders one package
  into each client's native instruction surface.
- `planmode check` — full-tree, base-directory, and baseline modes; command,
  path, and grep checks; changed-file scoping; proof bundle; optional flake rerun.
- `planmode guard` — add, list, verify, propose. Guards are included in every
  check.
- `planmode loop` — agent-agnostic builder command, copied workspace, baseline,
  failure packet, no-progress/regression/timeout stop rules, frozen judge inputs,
  protected-file detection, plan and contract hashes, diff audit, optional
  semantic reviewer, proof bundle.
- `planmode judge` — deterministic checks plus diff audit, contract criteria,
  optional semantic review, and `JUDGE.json`/`JUDGE.md`.
- Frozen contract from plan frontmatter or `.planmode/contract.yaml`; criteria
  can be mapped to named checks.
- Diff audit for protected files, allowed scope, existing test edits, dependency
  manifests, secrets, binary changes, stubs, deleted files, and size budgets.
- Deterministic guard suggestions from failed checks.
- 195 CLI tests, including temp-directory tests with no git repository and
  semantic-reviewer/loop integration.
- The prototype fixtures reproduce the earlier scores exactly: `go-api` 20/100
  on bad and 100/100 on good; command fixtures pass/fail correctly.
- An end-to-end loop demo passes in two iterations, leaves the source checkout
  untouched, and works with no `.git` directory.

## Still to build

1. Harden the loop controller: automatic restore/reject of protected-file
   changes, config-driven client launch, resumable attempts.
2. Runtime evidence: testcontainers, HTTP smoke, Playwright, database migrations.
3. AST checks and optional mutation testing on changed lines.
4. Guard fixtures in CI and a `harnessbench` task suite.
5. Cross-client comparison: same plan, multiple agents, one judge.
6. Richer diff viewing and per-finding approval in the proof bundle.

## Open questions

- Where should the contract live: plan frontmatter, `planmode.yaml`, or a
  separate `contract.yaml`? (Frontmatter and `.planmode/contract.yaml` are both
  supported; an explicit `--contract` wins.)
- Should guards live per-project, per-harness, or both?
- What is the default iteration budget, and when may it be exceeded?
- How much runtime evidence is enough for a "green" on a typical web app?
- Should the semantic reviewer be a separate model, a separate session, or both?
