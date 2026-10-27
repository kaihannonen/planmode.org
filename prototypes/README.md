# Harness prototypes (unpublished)

Ten candidate harness packages, the validator that checks them, and the eval runner
used to test them. Nothing here is registered, published, or wired into the CLI yet.

## Layout

```
prototypes/
  harnesses/
    _shared/rules/        rules reused across harnesses
    <name>/
      harness.yaml        manifest
      rules/*.md          harness-specific rules
      plans/*.md          harness-specific plans
  fixtures/               tiny projects used to prove evals fail and pass
  validate.mjs            manifest + composition validation
  run-evals.mjs           runs verification commands and evals against a target
```

## The ten

Ranked by how often the stack shows up in AI-assisted development work, not by
how interesting it is to build.

| # | Harness | Stack | Why it is here |
|---|---------|-------|----------------|
| 1 | `ts-nextjs` | Next.js App Router, TypeScript, Tailwind, Prisma | Most common full-stack JS setup |
| 2 | `node-api` | Node 22, Fastify, TypeScript, Postgres | Default backend for JS teams |
| 3 | `python-fastapi` | Python 3.12, FastAPI, SQLAlchemy, Alembic | Default Python API stack |
| 4 | `react-vite` | React 19, Vite, TypeScript, Vitest | Most common SPA setup |
| 5 | `go-api` | Go, chi, sqlc, Postgres | Standard service stack in infra teams |
| 6 | `django` | Django 5, DRF, Postgres | Large existing install base |
| 7 | `java-spring` | Spring Boot 3, Maven, Postgres | Enterprise default |
| 8 | `terraform-aws` | Terraform 1.9, AWS | Infra work is where agents do damage |
| 9 | `expo-react-native` | Expo, TypeScript | Default mobile stack |
| 10 | `rust-cli` | Rust, clap | Growing CLI/tooling share |

## What a harness contains

A manifest that composes rules and plans, declares the clients it targets, and
carries two kinds of proof:

- `verification.commands` — real build/test/lint commands
- `evals` — structural checks with `grep-present`, `grep-absent`, `path-exists`
  and `command`

`mcp` entries under `suggests` are advisory only. Nothing resolves or installs
them yet.

## Validate

```sh
node prototypes/validate.mjs
```

## Run evals against a project

```sh
node prototypes/run-evals.mjs \
  --harness prototypes/harnesses/go-api \
  --target prototypes/fixtures/go-bad
```

Add `--skip-commands` when the toolchain for that stack is not installed.

## Status

Prototype. Manifests and content are real; the install pipeline does not exist yet.
