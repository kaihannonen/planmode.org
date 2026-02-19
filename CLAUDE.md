# Planmode — Plans you can `install`.

The open source package manager for AI plans, rules, and prompts.

**Website:** planmode.org
**License:** MIT
**Repository:** github.com/kaihannonen/planmode.org

## Plans

- @plans/build-planmode.md

## The problem

Developers share code through npm, pip, cargo. But AI instructions — the plans, rules, and prompts that drive AI-assisted development — have no equivalent. You write a detailed plan for setting up Next.js with auth, Prisma, and deployment, and it lives in one project forever. There's no way to publish it, version it, or let others install it.

## What exists today

### Closest to "npm for prompts"

- **PRPM** (prpm.dev) — the most npm-like. CLI tool (`prpm install collection/nextjs-pro`), has a registry of 1,500+ packages, supports Cursor rules, Claude skills, agents. Publishes once, converts to multiple editor formats. Still early-stage.
- **LangChain Hub** (smith.langchain.com/hub) — prompt registry integrated into LangSmith. Version-controlled prompts you can `pull()` in code. Focused on LangChain ecosystem.
- **PromptHub** (prompthub.us) — SaaS for prompt management, versioning, A/B testing. More enterprise/team-oriented than community registry.
- **FlowGPT** — community-driven prompt sharing, more like a social marketplace than a package manager.

None of them have achieved npm-level adoption. The space is fragmented.

## Why Planmode

### What npm gets right that prompt registries don't (yet)

- Semver versioning + lockfiles
- Dependency resolution (prompt A needs prompt B as context)
- `package.json`-like metadata (model compatibility, token cost estimates, input/output schemas)
- Community trust signals (downloads, stars, verified publishers)

### Why open source and git-backed

- **Transparency** — users need to see exactly what a plan/prompt contains before running it with AI. Open source is the only trust model that works here.
- **Free hosting** — GitHub repos as storage means infinite scale at zero cost
- **Built-in versioning** — git tags = versions, branches = channels
- **Community contributions** — PRs for improvements, issues for bugs
- **CI/CD** — GitHub Actions for validation (lint prompts, test token counts, check model compatibility)
- **No vendor lock-in** — the registry is a JSON file, the packages are `.md` files. If Planmode disappears, everything still works.

### Why "planmode"

Plans — multi-step implementation guides — are the most valuable package type. Single prompts are too simple to need a package manager. Plans with dependencies on rules and sub-plans are where the real value is. The name leads with the strongest use case.

## Claude Code already supports this natively

Claude Code's `CLAUDE.md` has built-in `@import` syntax that effectively gives you a dependency system today. This significantly reduces the scope of what Planmode needs to do — the runtime is already there.

### How it works

**`@import` in CLAUDE.md** — reference any `.md` file by path:

```markdown
# Plans & recipes
- @plans/static-website.md
- @plans/image-pipeline.md
- @plans/deployment.md
```

- Relative paths resolve from the file containing the import
- Recursive imports supported (up to 5 levels deep)
- One-time approval dialog per project on first use

**`.claude/rules/` auto-discovery** — any `.md` files in this directory (including subdirectories) are loaded automatically:

```
.claude/
├── CLAUDE.md
└── rules/
    ├── frontend.md
    └── plans/
        ├── static-website.md
        └── image-pipeline.md
```

### What this means for Planmode

The install step becomes trivially simple:

1. CLI fetches `.md` files from a GitHub repo
2. Drops them into a `plans/` directory in the project
3. Adds `@plans/<name>.md` to CLAUDE.md

That's it. No custom runtime, no plugin system, no editor integration to build. Claude Code is already the runtime. Planmode just handles discovery, versioning, and file placement.

---

## Technical specification

Everything below is the implementation spec. It contains enough detail to build the MVP from scratch.

### Tech stack

**CLI (`planmode`)**

| Choice | Technology | Why |
|--------|-----------|-----|
| Language | TypeScript (strict mode) | Same ecosystem as the target audience |
| Runtime | Node.js >= 20 | LTS, native fetch, stable ESM |
| Build | tsup | Fast, zero-config, outputs CJS + ESM |
| Arg parser | commander | Most popular, well-documented, supports subcommands |
| YAML parser | yaml (npm: `yaml`) | Full YAML 1.2 spec, TypeScript types |
| Templating | handlebars | Mustache-compatible, supports helpers, well-maintained |
| HTTP | Native fetch | No dependencies, built into Node 20+ |
| Git operations | simple-git | Thin wrapper around git CLI, avoids shelling out |
| Testing | vitest | Fast, TypeScript-native, compatible with Node |
| Linting | eslint + prettier | Standard |

**Registry (`planmode/registry`)**

- Plain GitHub repo with JSON files
- GitHub Actions for CI (validate manifests on PR)
- No runtime dependencies

**Website (`planmode.org`)**

| Choice | Technology | Why |
|--------|-----------|-----|
| Framework | Astro | Static-first, fast builds, minimal JS shipped |
| Styling | Tailwind CSS | Utility-first, matches developer audience |
| Hosting | Cloudflare Pages | Free, fast, global CDN, zero egress cost |
| Search | Client-side (Fuse.js) | No API needed for Phase 1, fuzzy search |
| Design | Minimal, black + soft red | Developer-friendly, content-focused |

### Project structure

#### CLI repo — `github.com/planmode/planmode`

```
planmode/
├── src/
│   ├── index.ts                 # Entry point, commander setup
│   ├── commands/
│   │   ├── install.ts           # planmode install
│   │   ├── uninstall.ts         # planmode uninstall
│   │   ├── search.ts            # planmode search
│   │   ├── run.ts               # planmode run (templated prompts)
│   │   ├── publish.ts           # planmode publish
│   │   ├── update.ts            # planmode update
│   │   ├── list.ts              # planmode list
│   │   ├── info.ts              # planmode info
│   │   ├── init.ts              # planmode init
│   │   └── login.ts             # planmode login
│   ├── lib/
│   │   ├── config.ts            # ~/.planmode/config read/write
│   │   ├── registry.ts          # Fetch/cache/search the registry index
│   │   ├── resolver.ts          # Resolve package name → source repo + version
│   │   ├── installer.ts         # Download package, place files, update CLAUDE.md
│   │   ├── manifest.ts          # Parse/validate planmode.yaml
│   │   ├── template.ts          # Handlebars rendering + resolvers
│   │   ├── lockfile.ts          # Read/write planmode.lock
│   │   ├── git.ts               # Git operations (clone, fetch tags, sparse checkout)
│   │   ├── claude-md.ts         # Read/update CLAUDE.md @import entries
│   │   └── logger.ts            # Colored terminal output
│   └── types/
│       └── index.ts             # Shared TypeScript types
├── tests/
│   ├── commands/                # One test file per command
│   ├── lib/                     # One test file per lib module
│   └── fixtures/                # Sample packages for testing
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .eslintrc.js
├── LICENSE                      # MIT
├── README.md
└── CLAUDE.md                    # Planmode eats its own dog food
```

#### Registry repo — `github.com/planmode/registry`

```
registry/
├── index.json                   # Full package list (array of package summaries)
├── categories.json              # Packages grouped by category
├── packages/
│   ├── nextjs-tailwind-starter/
│   │   ├── metadata.json        # Full package metadata
│   │   └── versions/
│   │       ├── 1.0.0.json       # Version-specific metadata
│   │       └── 1.1.0.json
│   └── typescript-strict/
│       ├── metadata.json
│       └── versions/
│           └── 1.0.0.json
├── .github/
│   └── workflows/
│       ├── validate-pr.yml      # Lint manifest, check conflicts on PR
│       └── update-index.yml     # Rebuild index.json on merge to main
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

#### Website repo — `github.com/planmode/planmode.org`

```
planmode.org/
├── src/
│   ├── pages/
│   │   ├── index.astro          # Homepage
│   │   ├── packages/
│   │   │   ├── index.astro      # Browse/search all packages
│   │   │   └── [name].astro     # Package detail page (dynamic route)
│   │   └── docs/
│   │       ├── index.astro      # Getting started
│   │       ├── cli.astro        # CLI reference
│   │       ├── publishing.astro # How to publish
│   │       └── spec.astro       # Package spec reference
│   ├── components/
│   │   ├── PackageCard.astro
│   │   ├── SearchBar.astro
│   │   ├── InstallButton.astro
│   │   ├── CategoryNav.astro
│   │   └── Header.astro
│   ├── layouts/
│   │   └── Base.astro
│   └── styles/
│       └── global.css
├── public/
│   ├── favicon.svg
│   └── og-image.png
├── astro.config.mjs
├── tailwind.config.mjs
├── package.json
└── README.md
```

---

## Schemas

### `planmode.yaml` — package manifest (complete spec)

```yaml
# ── Required fields ──
name: nextjs-tailwind-starter        # Unique package name. Lowercase, hyphens only.
                                      # Scoped: @org/name for private packages.
version: 1.0.0                       # Semver (major.minor.patch)
type: plan                            # "prompt" | "rule" | "plan"

# ── Required for publishing ──
description: "Full-stack Next.js starter with Tailwind, Prisma, and auth"
author: username                      # GitHub username
license: MIT                          # SPDX identifier

# ── Optional fields ──
repository: github.com/username/repo  # Source repo URL
models:                               # Compatible AI models (informational)
  - claude-4
  - claude-3.5
  - gpt-4o
tags:                                 # For search/discovery (max 10)
  - nextjs
  - tailwind
  - frontend
  - prisma
category: frontend                    # Primary category for registry grouping
                                      # Categories: frontend, backend, devops, database,
                                      # testing, mobile, ai-ml, design, security, other

# ── Dependencies (plans and rules only) ──
dependencies:
  rules:                              # Auto-installed to .claude/rules/
    - tailwind-best-practices
    - typescript-strict@^1.0.0        # Version ranges supported
  plans:                              # Referenced as sub-plans
    - prisma-setup@~2.0.0

# ── Variables (for templated packages) ──
variables:
  framework:
    description: "Target framework"
    type: enum                        # "string" | "number" | "boolean" | "enum" | "resolved"
    options: [nextjs, remix, express] # Required for type: enum
    required: true                    # Default: false
    default: nextjs                   # Default value (required if required: false)
  project_name:
    description: "Your project name"
    type: string
    required: true

# ── Content (the actual plan/rule/prompt) ──
# Option A: inline content
content: |
  1. Create a new {{framework}} project called {{project_name}}
  2. Install Tailwind CSS
  3. Set up Prisma with PostgreSQL
  ...

# Option B: separate file (preferred for long content)
content_file: plan.md                 # Relative path to the content file
```

### Field validation rules

| Field | Rule |
|-------|------|
| `name` | `/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-]*$/`, max 100 chars |
| `version` | Valid semver (`X.Y.Z`, no pre-release tags in v1) |
| `type` | One of: `prompt`, `rule`, `plan` |
| `description` | Max 200 chars |
| `tags` | Max 10, each lowercase alphanumeric + hyphens |
| `variables[].type` | One of: `string`, `number`, `boolean`, `enum`, `resolved` |
| `dependencies` | Only allowed for `type: plan` and `type: rule` |

### Registry JSON schemas

**`index.json`** — full package list (fetched and cached by CLI):

```json
{
  "version": 1,
  "updated_at": "2026-02-12T10:00:00Z",
  "packages": [
    {
      "name": "nextjs-tailwind-starter",
      "version": "1.1.0",
      "type": "plan",
      "description": "Full-stack Next.js starter with Tailwind, Prisma, and auth",
      "author": "username",
      "category": "frontend",
      "tags": ["nextjs", "tailwind", "prisma"],
      "downloads": 0,
      "created_at": "2026-01-15T08:00:00Z",
      "updated_at": "2026-02-01T12:00:00Z"
    }
  ]
}
```

**`packages/<name>/metadata.json`** — full package metadata:

```json
{
  "name": "nextjs-tailwind-starter",
  "description": "Full-stack Next.js starter with Tailwind, Prisma, and auth",
  "author": "username",
  "license": "MIT",
  "repository": "github.com/username/nextjs-tailwind-starter",
  "category": "frontend",
  "tags": ["nextjs", "tailwind", "prisma"],
  "type": "plan",
  "models": ["claude-4", "claude-3.5"],
  "latest_version": "1.1.0",
  "versions": ["1.0.0", "1.1.0"],
  "downloads": 0,
  "created_at": "2026-01-15T08:00:00Z",
  "updated_at": "2026-02-01T12:00:00Z",
  "dependencies": {
    "rules": ["tailwind-best-practices", "typescript-strict@^1.0.0"],
    "plans": ["prisma-setup@~2.0.0"]
  },
  "variables": {
    "framework": {
      "description": "Target framework",
      "type": "enum",
      "options": ["nextjs", "remix", "express"],
      "required": true,
      "default": "nextjs"
    }
  }
}
```

**`packages/<name>/versions/<version>.json`** — version-specific data:

```json
{
  "version": "1.1.0",
  "published_at": "2026-02-01T12:00:00Z",
  "source": {
    "repository": "github.com/username/nextjs-tailwind-starter",
    "tag": "v1.1.0",
    "sha": "abc123def456"
  },
  "files": ["planmode.yaml", "plan.md"],
  "content_hash": "sha256:abcdef1234567890"
}
```

### `planmode.lock` — lockfile

Created in the project root on first `planmode install`. Tracks exact installed versions.

```yaml
lockfile_version: 1

packages:
  nextjs-tailwind-starter:
    version: 1.1.0
    type: plan
    source: github.com/username/nextjs-tailwind-starter
    tag: v1.1.0
    sha: abc123def456
    content_hash: sha256:abcdef1234567890
    installed_to: plans/nextjs-tailwind-starter.md

  tailwind-best-practices:
    version: 1.0.0
    type: rule
    source: github.com/planmode/registry
    tag: v1.0.0
    sha: 789ghi012345
    content_hash: sha256:fedcba0987654321
    installed_to: .claude/rules/tailwind-best-practices.md

  typescript-strict:
    version: 1.2.0
    type: rule
    source: github.com/planmode/registry
    tag: v1.2.0
    sha: 456jkl789012
    content_hash: sha256:1234567890abcdef
    installed_to: .claude/rules/typescript-strict.md
```

### `~/.planmode/config` — global config

```yaml
# Authentication
auth:
  github_token: ghp_xxxxx                # or set PLANMODE_GITHUB_TOKEN env var

# Registry sources
registries:
  default: github.com/planmode/registry  # public registry (always present)
  mycompany: github.com/mycompany/planmode-packages
  personal: github.com/username/my-plans

# Cache settings
cache:
  dir: ~/.planmode/cache                 # default cache directory
  ttl: 3600                              # registry index cache TTL in seconds (1 hour)
```

---

## CLI command specifications

### `planmode install <package> [--rule] [--version <ver>]`

Install a package into the current project.

**Arguments:**
- `<package>` — package name (e.g., `nextjs-tailwind-starter` or `@mycompany/deploy`)
- `--rule` — force install as a rule (to `.claude/rules/`) regardless of package type
- `--version <ver>` / `-v <ver>` — install specific version (default: latest)

**Behavior:**
1. Resolve package name → source repo + version (check lockfile first, then registry)
2. Fetch the package content from the source repo (git sparse checkout of the tag)
3. Parse `planmode.yaml`, validate manifest
4. If the package has `variables` with `required: true` and no defaults, prompt the user interactively (or fail if `--no-input` flag is set)
5. If templated, render content with Handlebars using provided/default values
6. Place files based on package type:
   - `rule` → `.claude/rules/<name>.md`
   - `plan` → `plans/<name>.md` + add `@plans/<name>.md` import to CLAUDE.md
   - `prompt` → `prompts/<name>.md`
7. Recursively install dependencies (rules and sub-plans)
8. Update `planmode.lock`
9. Print summary: what was installed, where files were placed

**File placement rules:**
- Create target directories if they don't exist (`plans/`, `prompts/`, `.claude/rules/`)
- If CLAUDE.md doesn't exist, create it with the `@import` line
- If CLAUDE.md exists, append the `@import` line under a `# Planmode` section (create if missing)
- If a file already exists at the target path, compare content hashes — skip if identical, prompt user if different
- Never overwrite without confirmation

**Error cases:**
- Package not found → "Package '<name>' not found in registry. Run `planmode search <query>` to find packages."
- Network failure → "Failed to fetch package. Check your connection and try again."
- Version not found → "Version '<ver>' not found for '<name>'. Available: 1.0.0, 1.1.0"
- Auth required for private package → "Package '@org/name' requires authentication. Run `planmode login` first."
- Conflict → "File already exists at plans/<name>.md with different content. Overwrite? [y/N]"

### `planmode uninstall <package>`

Remove an installed package.

**Behavior:**
1. Check `planmode.lock` for the package
2. Remove the installed file(s)
3. Remove the `@import` line from CLAUDE.md (for plans)
4. Check if any other installed packages depend on this one — warn if so
5. Update `planmode.lock`
6. Do NOT remove dependencies that were auto-installed — they may be shared. Print a note: "Note: dependency 'tailwind-best-practices' was kept (also used by other packages). Run `planmode uninstall tailwind-best-practices` to remove it."

### `planmode search <query>`

Search the registry.

**Behavior:**
1. Load cached `index.json` (fetch if stale or missing)
2. Fuzzy-search against: name, description, tags, author
3. Display results in a table:

```
  NAME                          TYPE   VERSION  DESCRIPTION
  nextjs-tailwind-starter       plan   1.1.0    Full-stack Next.js starter with Tailwind...
  tailwind-best-practices       rule   1.0.0    Tailwind CSS coding standards and best...
  typescript-strict              rule   1.2.0    Strict TypeScript configuration rules
```

**Flags:**
- `--type <type>` — filter by type (prompt/rule/plan)
- `--category <cat>` — filter by category
- `--json` — output as JSON (for piping)

### `planmode run <prompt> [--var value...]`

Run a templated prompt, outputting the rendered text to stdout.

**Behavior:**
1. Find the prompt package (check `prompts/` locally first, then registry)
2. Parse variables from the manifest
3. For each variable:
   - If provided via `--flag`, use that value
   - If not provided and has a default, use the default
   - If not provided, no default, and required — prompt interactively
   - If `type: resolved`, execute the resolver (fetch URL, extract value)
4. Render the content through Handlebars
5. Output the rendered prompt to stdout

**Example:**
```bash
# Renders and prints to stdout
planmode run weather-image --location "Tokyo" --style watercolor

# Pipe directly into Claude Code
planmode run weather-image --location "Tokyo" | claude

# Interactive mode — prompts for each variable
planmode run weather-image
```

**Flags:**
- `--no-input` — fail if any required variable is missing (no interactive prompts)
- `--json` — output as JSON `{ "rendered": "...", "variables": {...} }`

### `planmode publish`

Publish the current directory as a package to the public registry.

**Behavior:**
1. Read `planmode.yaml` from current directory — fail if missing
2. Validate all required fields (name, version, type, description, author, license)
3. Check that the version doesn't already exist in the registry
4. Verify the package name is available (or owned by the current user)
5. Create a git tag `v<version>` in the source repo if not already tagged
6. Generate the registry entry files (metadata.json, version.json)
7. Fork `planmode/registry` (if not already forked), create a branch, commit the entry, open a PR
8. Print the PR URL for the user to track

**Requirements:**
- GitHub auth must be configured (`planmode login`)
- Current directory must be a git repo with a remote
- `planmode.yaml` must be present and valid

### `planmode update [package]`

Update installed packages to latest compatible versions.

**Behavior:**
1. If `<package>` specified, update only that package. Otherwise, update all.
2. For each package in `planmode.lock`:
   - Check registry for newer versions
   - Respect version ranges from dependent packages (e.g., `^1.0.0`)
   - If newer version available, run install flow (overwrite existing files)
3. Update `planmode.lock`
4. Print summary of updates

### `planmode list`

List all installed packages in the current project.

**Behavior:**
1. Read `planmode.lock`
2. Display in table format:

```
  NAME                          TYPE   VERSION  LOCATION
  nextjs-tailwind-starter       plan   1.1.0    plans/nextjs-tailwind-starter.md
  tailwind-best-practices       rule   1.0.0    .claude/rules/tailwind-best-practices.md
  typescript-strict              rule   1.2.0    .claude/rules/typescript-strict.md
```

### `planmode info <package>`

Show detailed info about a package.

**Behavior:**
1. Fetch full metadata from registry (`packages/<name>/metadata.json`)
2. Display: name, description, author, license, type, versions, dependencies, variables, download count, repo URL

### `planmode init`

Initialize a new package in the current directory.

**Behavior:**
1. Interactive prompts for: name, type, description, author, license, tags, category
2. Create `planmode.yaml` with the provided values
3. Create a stub content file based on type:
   - `plan` → `plan.md` with template
   - `rule` → `rule.md` with template
   - `prompt` → `prompt.md` with template
4. Print next steps: "Edit your content file, then run `planmode publish` when ready."

### `planmode login [--token <token>] [--gh]`

Configure authentication.

**Behavior:**
- `--token <token>` — store the token in `~/.planmode/config`
- `--gh` — read token from `gh auth token` (GitHub CLI)
- No flags — interactive prompt for token
- Validate the token by making a test API call to GitHub
- Store in `~/.planmode/config` under `auth.github_token`

---

## Versioning and dependency resolution

### Semver

All packages use strict semver (`MAJOR.MINOR.PATCH`). No pre-release tags in v1 of Planmode.

### Version ranges in dependencies

Dependencies in `planmode.yaml` support npm-style ranges:

| Syntax | Meaning |
|--------|---------|
| `1.2.3` | Exact version |
| `^1.2.3` | Compatible with 1.x.x (>=1.2.3, <2.0.0) |
| `~1.2.3` | Patch-level changes (>=1.2.3, <1.3.0) |
| `>=1.0.0` | Any version >= 1.0.0 |
| `*` | Any version (latest) |

No range = latest version.

### Resolution algorithm

1. Read all dependencies from `planmode.yaml`
2. For each dependency, find the highest version that satisfies the range
3. If multiple packages depend on the same package with different ranges, find the highest version that satisfies ALL ranges
4. If no version satisfies all ranges, fail with a clear error showing the conflict
5. Write resolved versions to `planmode.lock`

---

## Private packages

Not everything should be public. Teams have proprietary deployment playbooks, company-specific coding standards, and internal workflows that shouldn't live in a public registry. Planmode handles this with scoped packages and GitHub token auth.

### Three tiers of visibility

| Level | Scope | How it works | Publishing |
|-------|-------|-------------|-----------|
| **Public** | Everyone | Listed in the public registry | `planmode publish` → PR to `planmode/registry` |
| **Org-private** | Team/org members | Private GitHub repo, accessed via token | `git push` to the org's private repo |
| **Personal** | Only you | Private repo, your token only | `git push` to your own repo |

### Authentication

```bash
# One-time auth setup — stored in ~/.planmode/config
planmode login --token ghp_xxxxx

# Or use the gh CLI's existing auth (zero friction for GitHub users)
planmode login --gh
```

GitHub personal access tokens (PATs) with fine-grained permissions are the auth mechanism. The CLI stores the token locally and uses it for all private repo access. For organizations, a GitHub App can provide org-wide access without individual PATs.

### Scoped packages — the `@org` convention

Private packages use npm-style scoped names:

```bash
# Register a private source
planmode registry add mycompany github.com/mycompany/planmode-packages

# Install from it — @scope tells the CLI to use the private source
planmode install @mycompany/deploy-playbook
planmode install @mycompany/coding-standards --rule

# Public packages have no scope prefix
planmode install nextjs-tailwind-starter
```

The `@scope` convention makes it unambiguous: if a package name starts with `@`, the CLI looks at the configured private source for that scope. No `@` = public registry.

### Private registry format

A private registry is identical to the public one — a GitHub repo with the same JSON index format:

```
github.com/mycompany/planmode-packages/
├── index.json              # same format as public registry
├── packages/
│   ├── deploy-playbook/
│   │   ├── planmode.yaml
│   │   └── plan.md
│   └── coding-standards/
│       ├── planmode.yaml
│       └── rule.md
```

This means:
- **No separate infrastructure** for private packages
- **Same CLI commands** work for public and private
- **Easy migration** — move a private package to public by submitting it to the public registry
- **Self-hosted option** — enterprises can run their own registry without depending on planmode.org

---

## Package taxonomy: Prompts, Rules, and Plans

Not all AI instructions are the same. The content divides naturally into three types, each with a different lifecycle and purpose.

### Prompts — fire once, get a result

Standalone, single-use instructions. You run them, get output, move on.

> "Generate a REST API for a blog with posts, comments, and auth"
> "Write unit tests for all exported functions in this file"

- No persistent state
- No dependencies (usually)
- The simplest package type
- **Supports templating** for reusable, parameterized prompts (see below)

### Rules — always-on constraints

Persistent guidelines that shape every AI interaction in a project. Installed once, always active.

> "Always use the latest Tailwind"
> "Use snake_case for Python, camelCase for TypeScript"
> "Never commit .env files"

- Apply across the entire project
- Usually short (1-10 lines)
- Stackable — multiple rules active at once

### Plans — multi-step implementation guides

Ordered task lists or detailed instructions for building something specific. Active during a task, removed when done.

> "1. Set up Next.js with App Router 2. Add Prisma with Postgres 3. Implement auth with NextAuth..."

- Can be bullet lists, numbered steps, or a combination
- May reference sub-plans
- May depend on rules being installed

### How they map to Claude Code

| Type        | Where it lives           | How Claude Code loads it           | Lifecycle         |
| ----------- | ------------------------ | ---------------------------------- | ----------------- |
| **Rules**   | `.claude/rules/*.md`     | Auto-loaded, always active         | Permanent         |
| **Plans**   | `plans/*.md`             | `@import` in CLAUDE.md when needed | Active during task |
| **Prompts** | `prompts/*.md`           | User references on demand          | Fire once          |

---

## Prompt templating

Prompts are dynamic by nature. A prompt like "Create an image that shows the weather in Helsinki today at 11:30" is only useful for one city and one time. Templating makes prompts reusable packages instead of one-off strings.

### Levels of dynamism

**Level 1: Simple variable substitution**

```
Create an image that shows the weather in {{location}} today at {{time}}
```

**Level 2: Defaults, descriptions, and types**

```yaml
variables:
  location:
    description: "City name"
    type: string
    default: "Helsinki"
  time:
    description: "Time of day"
    type: string
    default: "12:00"
prompt: "Create an image that shows the weather in {{location}} today at {{time}}"
```

**Level 3: Conditionals and loops**

```
Generate a {{style}} portrait of a person
{{#if background}}with a {{background}} background{{/if}}
{{#if accessories}}wearing {{#each accessories}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}{{/if}}
```

**Level 4: Dynamic data injection (resolvers)**

```yaml
variables:
  location:
    type: string
    default: "Helsinki"
  weather:
    type: resolved
    resolver: url
    source: "https://wttr.in/{{location}}?format=j1"
    extract: "current_condition[0].weatherDesc[0].value"
prompt: "Create an image showing {{weather}} weather in {{location}}"
```

Level 4 is where it gets powerful — the prompt resolves live data before being sent to the AI.

### Templating engine

Don't invent one. **Handlebars/Mustache** is the obvious choice:

- Widely known, works in every language
- Handles levels 1-3 natively
- Level 4 (resolvers) is a custom layer on top
- No logic-heavy templates — keeps prompts readable

### Full manifest example with templating

```yaml
name: weather-image
version: 1.0.0
type: prompt
description: "Generate weather-themed images for any city"
tags: [image, weather, creative]
license: MIT
author: username
variables:
  location:
    description: "City name"
    type: string
    required: true
    default: "Helsinki"
  time:
    description: "Time of day"
    type: string
    required: true
    default: "12:00"
  style:
    description: "Image style"
    type: enum
    options: [realistic, watercolor, pixel-art, sketch]
    default: realistic
content: |
  Create a {{style}} image that shows the weather
  in {{location}} today at {{time}}.
  Make it atmospheric and detailed.
```

### Templating in plans and rules too

Plans and rules can also use templates, though less commonly:

```yaml
name: add-authentication
type: plan
description: "Add authentication to any web framework"
variables:
  framework:
    type: enum
    options: [nextjs, remix, express, fastapi]
    required: true
  auth_provider:
    type: enum
    options: [nextauth, clerk, lucia, custom]
    default: nextauth
content: |
  1. Install {{auth_provider}} for {{framework}}
  2. Configure session management
  {{#if (eq framework "nextjs")}}
  3. Add middleware.ts for route protection
  {{else}}
  3. Add auth middleware to routes
  {{/if}}
  4. Create login/signup pages
  5. Add protected route examples
```

---

## Discovery & hosting strategy

### Phase 1: Launch — static + GitHub ($0/mo)

- Registry is a static `index.json` in a GitHub repo
- CLI searches a locally cached index (fetched/updated on first run)
- Publishing = PR to the registry repo (automated via `planmode publish`)
- Website = Cloudflare Pages static site
- **Total cost: $0**

Good enough for the first 1,000+ packages. This is how the early npm registry and Homebrew taps worked.

### Phase 2: Scale — Cloudflare Workers + KV ($5/mo)

Graduate when download counts, popularity ranking, or server-side search are needed:

```
GET /search?q=nextjs&category=frontend
GET /packages/nextjs-pro
POST /packages/nextjs-pro/downloads  (increment counter)
```

| Resource         | Free tier     | Paid ($5/mo)                |
| ---------------- | ------------- | --------------------------- |
| Worker requests  | 100K/day      | 10M/mo                      |
| KV reads         | 100K/day      | 10M/mo                      |
| KV storage       | 1 GB          | 1 GB (then $0.50/GB)        |
| R2 storage       | 10 GB         | 10 GB (then $0.015/GB)      |
| R2 egress        | **Free**      | **Free always**             |

The move from Phase 1 to 2 is trivial — the static JSON becomes the seed data for KV, and you add a ~50-line Cloudflare Worker in front.

---

## Branding

### Color palette

- **Primary black** — `#0A0A0A` for backgrounds, `#1A1A1A` for cards/surfaces
- **Soft red** — `#E05555` for primary accents (buttons, links, highlights, active states)
- **Red hover** — `#C94444` for hover/pressed states
- **Light greys** — `#F5F5F5` for light backgrounds, `#E0E0E0` for borders, `#9A9A9A` for secondary text
- **White** — `#FFFFFF` for primary text on dark backgrounds, card backgrounds in light mode
- Keep the palette tight — no gradients, no extra colors. Black, soft red, greys. That's it.

### Typography

- Use a clean, crisp sans-serif font stack — Inter or similar (highly legible at all sizes, excellent for developer tooling)
- Monospace font for code blocks and CLI examples — JetBrains Mono, Fira Code, or system monospace
- Keep font weights limited: regular (400) for body, medium (500) for emphasis, bold (700) for headings
- Generous line height (1.6+ for body text) for readability

### Design principles

- **Clean and minimal** — lots of whitespace, no visual clutter
- **Developer-friendly** — feels like a tool, not a marketing site. Content over decoration.
- **High contrast** — text must be easily readable against all backgrounds (WCAG AA minimum)
- **No unnecessary imagery** — icons and code examples over stock photos and illustrations

### Logo / wordmark

- "planmode" as a clean wordmark in the primary sans-serif font
- Soft red accent on the "plan" portion or as a subtle mark, black for the rest
- Must work at small sizes (favicon, npm badge) and large (homepage hero)

---

## Website guidelines

### Core principles

- **Simplicity first** — every page should do one thing well. No feature creep in the UI.
- **Responsive** — must work on all screen sizes, from mobile (320px) to ultrawide. Use Tailwind's responsive utilities, no fixed-width layouts.
- **Performance** — target 90+ on all four Lighthouse categories (Performance, Accessibility, Best Practices, SEO). Astro's static output makes this achievable out of the box — don't ruin it with unnecessary JS.
- **Minimal JavaScript** — ship as little client-side JS as possible. Astro's island architecture means interactive components (search bar) hydrate on demand; everything else is static HTML/CSS.

### Lighthouse targets

| Category | Target |
|----------|--------|
| Performance | 95+ |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |

To hit these:
- No layout shift (set explicit dimensions on images/embeds)
- Preload critical fonts, use `font-display: swap`
- Compress and lazy-load images
- Semantic HTML throughout (proper heading hierarchy, landmarks, alt text)
- Meta tags on every page (title, description, Open Graph)

### Responsive approach

- Mobile-first Tailwind classes
- Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
- Navigation collapses to a hamburger on mobile
- Package tables switch to card layout on small screens
- Code blocks scroll horizontally on narrow viewports rather than wrapping

---

## Hosting

### Cloudflare all the way

Everything runs on Cloudflare's stack. No AWS, no Vercel, no other providers.

| Service | What it hosts | Why |
|---------|--------------|-----|
| **Cloudflare Pages** | planmode.org static site | Free, auto-deploys from GitHub, global CDN |
| **Cloudflare Workers** | API layer (Phase 2) | Serverless, edge-deployed, $5/mo paid tier |
| **Cloudflare KV** | Registry index cache, download counts | Low-latency key-value at the edge |
| **Cloudflare R2** | Package content storage (if needed) | S3-compatible, zero egress fees |
| **Cloudflare DNS** | planmode.org domain | Free DNS, tight integration with Pages/Workers |

### Domain setup

- `planmode.org` → Cloudflare Pages (website)
- `api.planmode.org` → Cloudflare Worker (Phase 2, when API is needed)
- `registry.planmode.org` → redirect to GitHub repo (or Worker proxy in Phase 2)
- SSL/TLS managed by Cloudflare (full strict mode)

### Deployment pipeline

- Push to `main` on the website repo → Cloudflare Pages auto-builds and deploys
- Registry `update-index.yml` GitHub Action triggers a Cloudflare Pages deploy hook to rebuild the site with fresh package data
- Zero-downtime deploys (Cloudflare handles atomic deploys)

---

## Open source strategy

### Why MIT license

- Maximum adoption — no friction for commercial use
- Matches npm, Homebrew, and most successful package managers
- The packages themselves can have any license (specified in `planmode.yaml`)

### Community-driven from day one

- **Registry is a GitHub repo** — anyone can submit packages via PR
- **CLI is on npm** — standard contribution model (fork, PR, review)
- **Package review** — community can flag, comment, and improve packages
- **Maintainer program** — active contributors get merge access to the registry

### Governance

Start simple, formalize later:

1. **Now** — single maintainer, all PRs reviewed manually
2. **At 100+ contributors** — add 2-3 co-maintainers with merge access
3. **At scale** — consider a lightweight RFC process for breaking changes

### Revenue model (to sustain the project)

Planmode is free and open source. Private packages are free too — they're just private GitHub repos. Sustainability options if needed:

- **GitHub Sponsors / Open Collective** — donations from users and companies
- **Premium features on planmode.org** — team dashboards, usage analytics, hosted private registry (for teams that don't want to manage their own repo)
- **Enterprise tier** — managed registry, SSO, audit logs, priority support

The core (CLI + public registry + private packages via GitHub) is always free and open source.

---

## GitHub Actions for registry CI

### `validate-pr.yml` — runs on every PR to the registry

```yaml
# Validates:
# 1. planmode.yaml is present and valid YAML
# 2. All required fields are present (name, version, type, description, author, license)
# 3. Package name matches directory name
# 4. Version doesn't already exist
# 5. Name regex passes: /^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-]*$/
# 6. No duplicate package names
# 7. Dependencies reference existing packages (or are marked as external)
# 8. Content file exists if content_file is specified
```

### `update-index.yml` — runs on merge to main

```yaml
# 1. Scans all packages/ directories
# 2. Rebuilds index.json from all metadata.json files
# 3. Rebuilds categories.json grouped by category field
# 4. Commits updated index files
# 5. Triggers Cloudflare Pages rebuild for planmode.org
```

---

## Build order (MVP)

Step-by-step implementation order. Each step is independently testable.

### Step 1: Package spec + manifest parser (Day 1)

- Define `planmode.yaml` schema (as specified above)
- Build `src/lib/manifest.ts` — parse YAML, validate against schema, return typed object
- Build `src/types/index.ts` — TypeScript types for manifest, registry entries, config
- Write tests with fixture YAML files (valid + invalid manifests)

### Step 2: Config + auth (Day 1)

- Build `src/lib/config.ts` — read/write `~/.planmode/config`
- Build `src/commands/login.ts` — store GitHub token, validate with API call
- Support `PLANMODE_GITHUB_TOKEN` env var as override

### Step 3: Registry client (Day 2)

- Build `src/lib/registry.ts` — fetch `index.json` from GitHub, cache locally in `~/.planmode/cache/`
- Implement cache TTL (default 1 hour)
- Build `src/lib/resolver.ts` — resolve package name + version range → exact version + source
- Build `src/commands/search.ts` — fuzzy search against cached index
- Build `src/commands/info.ts` — fetch and display full package metadata

### Step 4: Installer (Days 2-3)

- Build `src/lib/git.ts` — clone/fetch from GitHub repos, sparse checkout for specific tags
- Build `src/lib/installer.ts` — download package, place files in correct location
- Build `src/lib/claude-md.ts` — read/update CLAUDE.md `@import` entries
- Build `src/lib/lockfile.ts` — read/write `planmode.lock`
- Build `src/commands/install.ts` — full install flow with dependency resolution
- Build `src/commands/uninstall.ts` — remove files, update lockfile and CLAUDE.md
- Build `src/commands/update.ts` — check for newer versions, re-install
- Build `src/commands/list.ts` — read lockfile, display table

### Step 5: Templating (Day 3)

- Build `src/lib/template.ts` — Handlebars rendering, resolver execution
- Build `src/commands/run.ts` — render templated prompt, output to stdout
- Support interactive variable input (prompts user for missing values)
- Support `--no-input` flag for CI/piping

### Step 6: Publishing (Day 4)

- Build `src/commands/init.ts` — scaffold new package with planmode.yaml + content stub
- Build `src/commands/publish.ts` — validate manifest, create git tag, fork registry, open PR
- Uses GitHub API via token (create fork, create branch, commit files, open PR)

### Step 7: CLI entry point + polish (Day 4)

- Build `src/index.ts` — commander setup, register all subcommands
- Build `src/lib/logger.ts` — colored output, progress indicators, error formatting
- Add `bin` field to package.json, configure tsup for CLI output
- Test end-to-end: `npm link` → `planmode install <test-package>`
- Write README.md with quick start guide

### Step 8: Registry repo setup (Day 5)

- Create `planmode/registry` repo
- Add GitHub Actions (`validate-pr.yml`, `update-index.yml`)
- Seed with 5-10 starter packages (real, useful plans and rules)
- Write CONTRIBUTING.md with submission guidelines

### Step 9: Website (Days 5-7)

- Set up Astro project with Tailwind
- Build homepage (hero with tagline, quick start, how it works)
- Build package browser (search, filter by type/category)
- Build package detail pages (description, install command, versions, dependencies)
- Build docs pages (getting started, CLI reference, publishing guide, spec reference)
- Deploy to Cloudflare Pages, point planmode.org domain
- Add build hook: registry updates trigger website rebuild

---

## Key insight

Prompts alone aren't that useful as packages. **Plans** (ordered tasks + context + dependencies on rules) are the most valuable package type. The `@import` system in Claude Code makes plans trivially composable — a plan can import sub-plans, and depend on rules that get auto-installed alongside it. **Templating** makes all three types reusable across projects and contexts.

Planmode doesn't try to build a runtime — it leverages Claude Code as the runtime and focuses on the missing pieces: **discovery, versioning, and distribution**.

---

## Sources

- [PRPM: Universal Package Manager for AI Prompts](https://vibecodingconsultant.com/blog/prpm-universal-package-manager-ai-prompts/)
- [LangChain Hub](https://smith.langchain.com/hub)
- [LangChain Hub GitHub](https://github.com/hwchase17/langchain-hub)
- [PromptHub + LangChain Integration](https://www.prompthub.us/blog/prompthub-langchain-integration-guide)

