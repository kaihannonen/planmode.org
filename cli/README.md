# planmode

The open source package manager for AI plans, rules, and prompts.

**Website:** [planmode.org](https://planmode.org)
**Repository:** [github.com/kaihannonen/planmode.org](https://github.com/kaihannonen/planmode.org)

> **Beta:** the verification commands (`check`, `judge`, `loop`, and `guard`)
> are in `0.5.0-beta.1`. Install the prerelease with:
>
> ```bash
> npm install -g planmode@next
> ```
>
> The stable `latest` release (`0.4.0`) does not include these commands yet.

## Install

```bash
npm install -g planmode
```

## Quick start

```bash
# Search for packages
planmode search nextjs

# Install a plan (adds to plans/ and updates CLAUDE.md)
planmode install nextjs-tailwind-starter

# Install a rule (goes to .claude/rules/)
planmode install typescript-strict

# Install for multiple clients at once
planmode install typescript-strict --target claude,codex,cursor,opencode

# Run a templated prompt
planmode run rest-api-generator --resource users --framework express

# See what's installed
planmode list

# Verify the current change without a git commit
planmode check --harness ./harness --target .

# Verify checks plus scope/tests/dependencies against a pristine copy
planmode judge --harness ./harness --target . --base-dir /tmp/project-base

# Run a builder in a copied workspace, verify, fix, repeat
planmode loop --plan plan.md --agent 'opencode run "$PLANMODE_PROMPT"' \
  --judge-agent 'claude -p "$PLANMODE_JUDGE_PROMPT"'

# Turn a failed check into a permanent regression guard
planmode guard add --from .planmode/guards.proposed.yaml --id prevent-no-console-log \
  --bad fixtures/bugs/console-bad --good fixtures/bugs/console-good
```

## Use with Claude Code (MCP)

Planmode includes an MCP server that lets Claude Code search, install, preview, and manage packages directly from your conversations — no need to leave the chat.

### Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and working (`claude` command available)
- Planmode installed globally: `npm install -g planmode`

### Setup

```bash
# Automatic — registers the MCP server with Claude Code
planmode mcp setup
```

This runs `claude mcp add --transport stdio planmode -- planmode-mcp` under the hood. You only need to do this once.

### Manual setup

If you prefer to register manually, or if the automatic setup doesn't work:

```bash
claude mcp add --transport stdio planmode -- planmode-mcp
```

Or add it directly to your Claude Code MCP config (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "planmode": {
      "command": "planmode-mcp",
      "transport": "stdio"
    }
  }
}
```

### Verify it works

After setup, start a Claude Code session and ask:

> "Search planmode for a Next.js starter plan"

Claude should call the `planmode_search` tool and return results from the registry.

### Available MCP tools

Once connected, Claude has access to these tools:

| Tool | What it does |
|------|-------------|
| `planmode_search` | Search the registry for packages |
| `planmode_info` | Get detailed package metadata |
| `planmode_preview` | Read a package's content before installing |
| `planmode_install` | Install a package into the current project |
| `planmode_uninstall` | Remove an installed package |
| `planmode_list` | List all installed packages |
| `planmode_read` | Read the content of an installed package |
| `planmode_update` | Update installed packages |
| `planmode_init` | Scaffold a new package |
| `planmode_publish` | Publish a package to the registry |
| `planmode_validate` | Validate a planmode.yaml manifest |
| `planmode_run` | Render a templated prompt with variables |
| `planmode_doctor` | Run a health check on installed packages |
| `planmode_test` | Validate a package before publishing |
| `planmode_record_start` | Start recording git commits for plan generation |
| `planmode_record_stop` | Stop recording and generate a plan |
| `planmode_snapshot` | Generate a plan from existing project setup |

Installed packages are also exposed as MCP resources that Claude can browse automatically.

### Example prompts

Ask Claude things like:

- "Search planmode for a Next.js starter plan"
- "Show me what the typescript-strict rule contains"
- "Install the docker-compose-stack plan"
- "Preview the rest-api-generator prompt before installing"
- "Run a health check on my planmode packages"
- "Create a new planmode rule called my-coding-standards"
- "Record my work and generate a plan from my commits"

### Remove

```bash
planmode mcp remove
```

## Package types

| Type | What it is | Where it lives | Lifecycle |
|------|-----------|---------------|-----------|
| **Plan** | Multi-step implementation guide | `plans/*.md` | Active during task |
| **Rule** | Always-on constraint | `.claude/rules/*.md` | Permanent |
| **Prompt** | Fire-once instruction | `prompts/*.md` | Single use |

## Commands

| Command | Description |
|---------|-------------|
| `planmode install <pkg>` | Install a package |
| `planmode uninstall <pkg>` | Remove a package |
| `planmode search <query>` | Search the registry |
| `planmode run <prompt>` | Run a templated prompt |
| `planmode list` | List installed packages |
| `planmode info <pkg>` | Show package details |
| `planmode update [pkg]` | Update packages |
| `planmode init` | Create a new package |
| `planmode publish` | Publish to the registry |
| `planmode login` | Configure GitHub auth |
| `planmode mcp setup\|remove` | Register/remove MCP server with Claude Code |
| `planmode doctor` | Check project health and file integrity |
| `planmode test` | Validate a package before publishing |
| `planmode check` | Run deterministic harness checks against a project |
| `planmode judge` | Run checks, a diff audit, and an optional semantic reviewer |
| `planmode loop` | Drive a builder through check/fix iterations in a copied workspace |
| `planmode guard add\|verify\|list\|propose` | Manage permanent regression guards |
| `planmode record start\|stop` | Generate a plan from git commits |
| `planmode snapshot` | Generate a plan from existing project setup |

## Verify locally without git

`planmode check` runs a harness against a project directory. It does not need a
git repository or a commit:

```bash
# Check the whole tree
planmode check --harness ./harness --target .

# Compare against a pristine copy and only scan changed files
planmode check --harness ./harness --target . \
  --base-dir /tmp/project-base --changed-only

# Save a baseline, make changes, then check only what changed
planmode check --harness ./harness --target . \
  --save-baseline /tmp/project.baseline.json
planmode check --harness ./harness --target . \
  --baseline /tmp/project.baseline.json --report-dir .planmode/runs/latest
```

Each run can write `report.json`, `PROOF.md`, and `guards.proposed.yaml`.

A baseline stores file hashes, previous results, and hashes of the check
definitions. If a check definition changes, its old status is not trusted: it is
re-run against the full target and a failure counts as new.

A skipped or unavailable check is **unverified**, not passing, so `check` exits
1 by default. Use `--allow-unverified` only for local debugging.

`--rerun-failures` reruns failed command checks once. A pass on the retry is
recorded in the `flaky` list and in `PROOF.md`, so a flaky green stays visible.

## Judge a change

`planmode judge` runs the deterministic checks and adds a diff audit. It needs a
pristine copy to compare against; no git commit is required:

```bash
planmode judge --harness ./harness --target . \
  --base-dir /tmp/project-base \
  --plan ./plan.md \
  --report-dir .planmode/runs/judge
```

The diff audit fails on:

- changed protected files (`harness.yaml`, guards, contract, `.github/**`)
- changes outside the contract's `allowed_paths`
- edits or deletions of existing test files, unless the contract allows them
- dependency manifest or lockfile changes, unless the contract allows them
- high-confidence secrets added by the change
- binary changes, unless `allow_binary_changes` is set
- unimplemented stubs (errors); TODO/FIXME comments are warnings
- deleted files and large diffs (warnings)
- a no-op change

Generated files such as `next-env.d.ts`, `*.tsbuildinfo`, and `.eslintcache` are
ignored, so running typecheck or a Next.js build does not create false changes.

It writes `JUDGE.json`, `JUDGE.md`, `DIFF_AUDIT.json`, and `DIFF_AUDIT.md`.

### Frozen contract

Put a contract in plan frontmatter or `.planmode/contract.yaml`:

```yaml
---
contract:
  acceptance:
    - criterion: "No console logging in production code"
      check: "no-console-log"
    - criterion: "The API returns 404 for a missing user"
      check: "command:api-tests"
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

A criterion with `check` must map to a check that runs and passes. A criterion
without `check` is left to the optional semantic reviewer. If a contract has an
unmapped criterion and no reviewer is configured, the judge is `inconclusive`
rather than silently passing. The plan and contract hashes are frozen before the
loop starts and recorded in `JUDGE.json`.

### Optional semantic reviewer

The semantic reviewer is a separate command. It receives the prompt in
`$PLANMODE_JUDGE_PROMPT` and must write JSON to `$PLANMODE_JUDGE_OUTPUT`:

```bash
planmode judge --harness ./harness --target . --base-dir /tmp/project-base \
  --plan ./plan.md \
  --judge-agent 'claude -p "$PLANMODE_JUDGE_PROMPT"'
```

```json
{
  "verdict": "pass",
  "summary": "The change satisfies the contract and stays in scope.",
  "findings": []
}
```

Verdicts are `pass`, `fail`, or `needs_human`. The semantic reviewer is never
the enforcement path: a deterministic failure cannot be overridden, and a
semantic rejection stops the loop at `needs_human` for a developer decision.
The judge snapshots the workspace around the reviewer and fails closed if the
reviewer edits files, exits nonzero while claiming `pass`, or leaves a stale
verdict from a previous run.

## Run the loop without git

`planmode loop` copies the project into a temp workspace, records a baseline,
runs any builder command, and rechecks after every attempt. It stops on pass, a
repeated failure, a regression, a timeout, or the iteration budget. The source
checkout is never edited.

```bash
# OpenCode
planmode loop --plan plan.md --agent 'opencode run "$PLANMODE_PROMPT"'

# Claude Code
planmode loop --plan plan.md --agent 'claude -p "$PLANMODE_PROMPT"'

# Codex
planmode loop --plan plan.md --agent 'codex exec "$PLANMODE_PROMPT"'

# With a separate semantic reviewer and flake reruns
planmode loop --plan plan.md --agent 'opencode run "$PLANMODE_PROMPT"' \
  --judge-agent 'claude -p "$PLANMODE_JUDGE_PROMPT"' \
  --rerun-failures
```

The builder gets the prompt in `$PLANMODE_PROMPT` and `$PLANMODE_PROMPT_FILE`,
the previous failure packet in `$PLANMODE_FAILURE_FILE`, and the working copy in
`$PLANMODE_WORKSPACE`. The semantic reviewer gets `$PLANMODE_JUDGE_PROMPT`,
`$PLANMODE_JUDGE_PROMPT_FILE`, `$PLANMODE_JUDGE_OUTPUT`, and
`$PLANMODE_JUDGE_WORKSPACE`. The loop prints the workspace and state paths so
every attempt can be inspected.

Every attempt writes `JUDGE.json`, `JUDGE.md`, `DIFF_AUDIT.md`, and the
deterministic `report.json`/`PROOF.md`. The plan and contract are read once and
hashed; a builder cannot edit the contract in the workspace to widen its own
scope. The loop stops at `needs_human` when the semantic reviewer rejects the
change or asks for a human.

The harness and guards are read from the source checkout, not the workspace. If
the builder edits a protected file such as `harness.yaml`, `.planmode/guards.yaml`,
`.planmode/contract.yaml`, the plan file, or `.github/**`, the loop stops and
records the change.

The copy excludes dependency directories. Pass `--link-deps` to symlink
`node_modules`, `.venv`, `venv`, `vendor`, and `.bundle` into the workspace so
verification commands can run. For a fully prepared environment, pass
`--workspace <dir>` instead.

## Permanent bug guards

When a check fails, `planmode check` proposes deterministic guards. Add a bad
fixture that reproduces the bug and a good fixture that represents correct
behavior; the guard is only written if the bad fixture fails and the good fixture
passes:

```bash
planmode guard add --kind grep-absent --path src --glob "**/*.ts" \
  --pattern 'console\.log' --reason "Debug logging shipped to production" \
  --bad fixtures/bugs/console-bad --good fixtures/bugs/console-good

planmode guard verify
```

Guards live in `.planmode/guards.yaml` and run on every check. A guard without
both fixtures is marked unverified and makes `check` exit 1; `--force` is only
for deliberate exceptions. See
[`plans/agent-loop.md`](../plans/agent-loop.md) for the full loop design.

## Install targets

The same package can be rendered for each client's native instruction surface:

| Target | Rules | Plans |
|--------|-------|-------|
| `claude` | `CLAUDE.md` imports | `@plans/*.md` |
| `codex` | `AGENTS.md` section | `AGENTS.md` link |
| `cursor` | `.cursor/rules/*.mdc` | `.cursor/rules/*.mdc` |
| `opencode` | `AGENTS.md` section | `AGENTS.md` link |

Set defaults in `planmode.config.yaml`:

```yaml
targets: [claude, codex, opencode]
```

## Create plans from your work

### Record mode

Start a recording, work normally, then generate a plan from your commits:

```bash
planmode record start
# ... do your work, make commits ...
planmode record stop --name my-setup-plan --author myusername
```

### Snapshot mode

Analyze an existing project and generate a plan that recreates the setup:

```bash
planmode snapshot --name nextjs-prisma-setup --author myusername
```

This reads `package.json`, detects config files (TypeScript, ESLint, Tailwind, Prisma, Docker, etc.), captures the directory structure, and creates a step-by-step plan.

## How it works

Planmode leverages Claude Code's native `@import` system. When you install a plan:

1. The CLI fetches `.md` files from the registry
2. Drops them into the correct directory (`plans/`, `.claude/rules/`, or `prompts/`)
3. Adds `@plans/<name>.md` to your `CLAUDE.md`

Claude Code is already the runtime. Planmode handles discovery, versioning, and distribution.

## Browse packages

Visit [planmode.org/packages](https://planmode.org/packages) to discover plans, rules, and prompts.

## License

MIT
