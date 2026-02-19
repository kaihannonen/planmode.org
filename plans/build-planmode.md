# How planmode was built

Step-by-step guide documenting how the planmode service was built from scratch: CLI, registry, website, analytics worker, and CI/CD.

## Step 1: Define the spec

Write CLAUDE.md with the full technical specification. This single document defines everything before any code is written:

- **Package manifest schema** (`planmode.yaml`) — name, version, type, description, author, license, dependencies, variables, content
- **Registry JSON schemas** — `index.json` (package list), `metadata.json` (full package data), `versions/*.json` (version-specific data)
- **Lockfile format** (`planmode.lock`) — YAML, tracks exact installed versions
- **Global config** (`~/.planmode/config`) — YAML, auth tokens, registry sources, cache settings
- **CLI command specs** — install, uninstall, search, run, publish, update, list, info, init, login
- **Versioning rules** — strict semver, npm-style ranges (`^`, `~`, `>=`, `*`)
- **Package taxonomy** — prompts (fire once), rules (always-on), plans (multi-step guides)
- **Hosting strategy** — Cloudflare Pages (website), GitHub (registry), Cloudflare Workers (analytics)
- **Branding** — black + soft red palette, Inter font, minimal design

The spec is detailed enough that any developer (or AI) can implement the full system from it.

## Step 2: Scaffold the CLI

Set up the `cli/` directory as a standalone npm package:

```
cli/
├── src/
│   ├── index.ts          # CLI entry point (commander)
│   ├── mcp.ts            # MCP server entry point
│   ├── commands/         # One file per CLI command
│   ├── lib/              # Pure business logic
│   └── types/
│       └── index.ts      # All shared TypeScript interfaces
├── package.json          # "type": "module", bin: { planmode: "./dist/index.js" }
├── tsconfig.json         # Strict mode
├── tsup.config.ts        # Builds both CLI and MCP entry points
└── vitest.config.ts
```

Key decisions:
- TypeScript strict mode, ESM throughout
- `tsup` builds to `dist/` with both `index.js` (CLI) and `mcp.js` (MCP server)
- `commander` for arg parsing, `@clack/prompts` for interactive UI
- Two entry points: CLI (`src/index.ts`) detects TTY and shows interactive menu or parses args; MCP (`src/mcp.ts`) runs as a stdio server

## Step 3: Types and manifest parser

**`types/index.ts`** — all shared interfaces, grouped by section:
- Package manifest: `PackageManifest`, `PackageType`, `VariableType`, `VariableDefinition`, `Category`
- Registry: `PackageSummary`, `RegistryIndex`, `PackageMetadata`, `VersionMetadata`
- Lockfile: `Lockfile`, `LockfileEntry`
- Config: `PlanmodeConfig`
- Context: `ContextRepo`, `IndexedFile`, `ContextRepoIndex`, `ContextIndex`
- Resolved: `ResolvedPackage`

**`lib/manifest.ts`** — parse and validate `planmode.yaml`:
- `parseManifest(raw)` — parse YAML string to `PackageManifest`
- `readManifest(dir)` — read `planmode.yaml` from directory
- `validateManifest(manifest, requirePublishFields?)` — returns array of error strings
- `readPackageContent(dir, manifest)` — read inline content or content_file
- Validates: name regex, semver format, valid type/category, tag limits, variable types, dependency rules

## Step 4: Config and auth

**`lib/config.ts`** — global config at `~/.planmode/config` (YAML):
- `readConfig()` / `writeConfig(config)` — read/write the YAML config file
- `getGitHubToken()` — checks `PLANMODE_GITHUB_TOKEN` env var first, then config file
- `setGitHubToken(token)` — stores token in config
- `getRegistries()` — returns merged default + custom registry sources
- `getCacheDir()` / `getCacheTTL()` — cache settings with defaults

**`commands/login.ts`** — authenticate with GitHub:
- `--token <token>` — directly provide a PAT
- `--gh` — read from `gh auth token` (GitHub CLI)
- Interactive mode — password prompt via `@clack/prompts`
- Validates token against GitHub API (`GET /user`) using `withSpinner()`

## Step 5: Registry client

**`lib/registry.ts`** — fetch and cache the registry index:
- `fetchIndex()` — fetch `index.json` from GitHub raw URL, cache locally in `~/.planmode/cache/`
- `searchPackages(query, filters?)` — fuzzy search against cached index (name, description, tags, author)
- `fetchPackageMetadata(name)` — fetch full `packages/<name>/metadata.json`
- `fetchVersionMetadata(name, version)` — fetch `packages/<name>/versions/<version>.json`
- Cache TTL: 1 hour (configurable), stored as local JSON file

**`lib/resolver.ts`** — semver resolution:
- `resolveVersion(packageName, versionRange?)` — find highest version satisfying range
- Supports npm-style ranges: exact, `^`, `~`, `>=`, `*`
- Returns `ResolvedPackage` with source repo, tag, SHA, manifest, content

**`commands/search.ts`** — search the registry, display results in a table
**`commands/info.ts`** — show detailed package metadata

## Step 6: Installer

The core of the CLI. Multiple lib modules work together:

**`lib/git.ts`** — fetch package files from GitHub:
- `fetchFileAtTag(repo, filePath, tag)` — fetch a single file at a specific git tag via GitHub raw content URL
- Uses native `fetch` with GitHub token for private repos

**`lib/installer.ts`** — download, template, and place files:
- `installPackage(name, options)` — full install flow:
  1. Resolve package name → version via registry
  2. Fetch `planmode.yaml` from source repo at tag
  3. Parse and validate manifest
  4. Fetch content (inline or content_file)
  5. If templated, prompt for variables (interactive) or use defaults/provided values
  6. Render content through Handlebars
  7. Place file based on type: `plans/<name>.md`, `.claude/rules/<name>.md`, or `prompts/<name>.md`
  8. Update CLAUDE.md imports (for plans)
  9. Install dependencies recursively
  10. Update `planmode.lock`
- `uninstallPackage(name)` — remove file, update lockfile, remove CLAUDE.md import
- `updatePackage(name?)` — check for newer versions, reinstall

**`lib/claude-md.ts`** — manage `@import` entries in CLAUDE.md:
- `addPlanImport(name, projectDir)` — add `@plans/<name>.md` under a `# Planmode` section
- `removePlanImport(name, projectDir)` — remove the import line
- Creates CLAUDE.md if it doesn't exist

**`lib/lockfile.ts`** — YAML lockfile at `planmode.lock`:
- `readLockfile(projectDir)` / `writeLockfile(lockfile, projectDir)`
- `addToLockfile(name, entry, projectDir)` / `removeFromLockfile(name, projectDir)`
- `getLockedVersion(name, projectDir)` — check if already installed
- `getDependents(name, projectDir)` — find packages that depend on this one

**Commands:** `install.ts`, `uninstall.ts`, `update.ts`, `list.ts`

## Step 7: Templating

**`lib/template.ts`** — Handlebars rendering:
- `renderTemplate(content, variables)` — compile and render Handlebars template
- `collectVariableValues(defs, provided)` — merge provided values with defaults, coerce types
- `resolveVariable(def, currentValues)` — for `type: resolved` variables, fetch URL and extract value using dot-bracket path notation
- `getMissingRequiredVariables(defs, provided)` — find variables that still need values
- Registers custom helpers: `eq` for equality comparison in conditionals

**`lib/prompts.ts`** — interactive variable collection:
- `promptForVariables(defs, provided, noInput)` — prompt for each missing variable using appropriate `@clack/prompts` widget (select for enum, confirm for boolean, text for string/number)
- `withSpinner(message, fn, successMessage)` — wrap async operations with clack spinner (no-op in non-interactive mode)
- `handleCancel(value)` — clean Ctrl+C handling
- `isInteractive()` — checks `process.stdin.isTTY` and `!process.env.CI`

**`commands/run.ts`** — render and output a templated prompt

## Step 8: Publishing

**`lib/publisher.ts`** — publish packages to the registry:
- `publishPackage(options)` — full publish flow:
  1. Read and validate `planmode.yaml` (with publish fields required)
  2. Check that version doesn't already exist in registry
  3. Create git tag `v<version>` if not already tagged
  4. Fork `planmode/registry` repo (or use existing fork)
  5. Create branch `add-<name>-<version>`
  6. Commit metadata.json and version.json to `packages/<name>/`
  7. Open PR to the registry
- Uses GitHub API via authenticated `fetch` calls

**`lib/init.ts`** — scaffold new packages:
- `createPackage(options)` — create `planmode.yaml` and stub content file
- Uses content templates from `lib/templates.ts` (plan, rule, prompt stubs)

**`commands/publish.ts`**, **`commands/init.ts`**

## Step 9: Health and testing

**`lib/doctor.ts`** — verify installation integrity:
- Check that all lockfile entries have corresponding files on disk
- Verify content hashes match
- Check CLAUDE.md imports match installed plans
- Report issues with actionable fix suggestions

**`lib/tester.ts`** — pre-publish validation:
- Validate manifest completeness
- Check content file exists and renders without errors
- Verify variable definitions are consistent

**`commands/doctor.ts`**, **`commands/test.ts`**

## Step 10: Advanced features

**`lib/recorder.ts`** — record git activity into a plan:
- `startRecordingAsync(label)` — start watching git commits
- `stopRecording()` — collect commits since start, generate a plan from the diff
- Useful for turning a manual coding session into a reusable plan

**`lib/snapshot.ts`** — analyze a project and generate a plan:
- `takeSnapshot(options)` — scan project files, structure, dependencies, and produce a plan that recreates the setup

**`lib/context.ts`** — project-level document indexing:
- `addContextRepo(repoPath)` / `removeContextRepo(repoPath)` — manage indexed repositories
- `reindexContext()` — scan and index all documents in tracked repos
- `getContextSummary()` — return summary statistics

**`commands/record.ts`**, **`commands/snapshot.ts`**, **`commands/context.ts`**

## Step 11: MCP server

**`mcp.ts`** — Model Context Protocol server exposing all CLI features as tools:

- Entry point: `new McpServer({ name: "planmode" })` with `StdioServerTransport`
- Each tool mirrors a CLI command: `planmode_search`, `planmode_install`, `planmode_uninstall`, `planmode_info`, `planmode_list`, `planmode_publish`, `planmode_init`, `planmode_run`, `planmode_update`, `planmode_doctor`, `planmode_test`, `planmode_record_start`, `planmode_record_stop`, `planmode_snapshot`, `planmode_context_add`, `planmode_context_remove`, `planmode_context_reindex`, `planmode_context_summary`, `planmode_resolve`, `planmode_validate`
- Input schemas defined with `zod` (`z.string()`, `z.enum()`, etc.)
- Output capture: `withCapture()` / `withCaptureAsync()` wrappers intercept logger output so tool results include human-readable messages
- Error adaptation: `adaptError()` rewrites CLI-oriented messages for MCP context
- Resource: `planmode://packages` resource template for browsing installed packages
- Registered via `commands/mcp.ts` which runs `node cli/dist/mcp.js` or configures Claude Code's MCP settings

## Step 12: Interactive CLI

**`commands/interactive.ts`** — full interactive experience using `@clack/prompts`:

- **First-run detection** — checks for `~/.planmode/config` and non-empty lockfile
- **First-run onboarding** — welcome note explaining plans/rules/prompts, then offers browse/search/create
- **Main menu loop** — repeating select menu with actions:
  - Search packages → `searchFlow()` with fuzzy search and install option
  - Browse by category → `browseFlow()` with category select and package listing
  - Install a package → `installFlow()` with package name prompt
  - Create a package → delegates to `initInteractive()` from `init.ts`
  - List installed → `listFlow()` reads lockfile and displays table
  - Manage context → `contextFlow()` for document indexing
  - Run doctor → `doctorFlow()` checks installation health
  - Exit
- Triggered when CLI is run with no args and `isInteractive()` is true (TTY, no CI)

## Step 13: Registry

GitHub repo at `registry/` (within the monorepo) with static JSON:

```
registry/
├── index.json                    # Full package list (PackageSummary[])
├── categories.json               # Packages grouped by category
└── packages/
    └── <name>/
        ├── metadata.json         # Full PackageMetadata
        └── versions/
            └── <version>.json    # VersionMetadata with source repo + SHA
```

**GitHub Actions:**
- `validate-pr.yml` — on PR: validate planmode.yaml, check name/version uniqueness, verify dependencies
- `update-index.yml` — on merge to main: rebuild index.json and categories.json from all package metadata, commit updated files

**Seeded with starter packages** — real, useful plans and rules for common setups.

## Step 14: Website

Astro + Tailwind CSS on Cloudflare Pages at `planmode.org`:

```
src/
├── pages/
│   ├── index.astro               # Homepage — hero, quick start, how it works
│   ├── packages/
│   │   ├── index.astro           # Browse/search all packages (client-side Fuse.js)
│   │   └── [name].astro          # Package detail — description, install command, versions
│   └── docs/
│       ├── index.astro           # Getting started guide
│       ├── cli.astro             # CLI reference (all commands)
│       ├── publishing.astro      # How to publish packages
│       └── spec.astro            # Package spec reference (planmode.yaml)
├── components/                   # Astro components (PackageCard, SearchBar, Header, etc.)
├── layouts/
│   └── Base.astro                # Shared layout with meta tags, fonts, nav, footer
└── styles/
    └── global.css                # Tailwind imports + custom styles
```

Design:
- Color palette: `#0A0A0A` (bg), `#1A1A1A` (surfaces), `#E05555` (accent red), `#C94444` (hover)
- Inter font (body), system monospace (code)
- Mobile-first responsive, Tailwind breakpoints
- Minimal JS — search is the only interactive island
- Lighthouse targets: Performance 95+, Accessibility 100, Best Practices 100, SEO 100
- Fetches `registry/index.json` at build time to generate package pages

## Step 15: Analytics worker

Cloudflare Worker + KV at `worker/`:

```
worker/
├── src/
│   └── index.ts                  # Hono app with KV bindings
├── wrangler.jsonc                # Cloudflare Worker config
└── package.json
```

- **Routes:** `POST /packages/:name/downloads` (increment counter), `GET /packages/:name/stats` (read counts), `POST /packages/:name/views` (page views)
- **Storage:** Cloudflare KV namespace for counters
- **CORS:** configured for planmode.org origin
- **Deployed** to `api.planmode.org` via Cloudflare Workers

## Step 16: CI/CD

Four GitHub Actions workflows:

**`ci.yml`** — runs on every PR and push to main:
- Lint and type-check the CLI (`npm run lint && npm run typecheck` in `cli/`)
- Run CLI tests (`npm test` in `cli/`)
- Build the CLI (`npm run build` in `cli/`)
- Build the website (`npm run build` in root)

**`deploy-website.yml`** — deploy Astro site to Cloudflare Pages:
- Triggered on push to main (when `src/`, `registry/`, or root config files change)
- Builds with `npm run build`, deploys via Cloudflare Pages GitHub integration

**`deploy-worker.yml`** — deploy analytics worker:
- Triggered on push to main (when `worker/` changes)
- Deploys via `wrangler deploy` with Cloudflare API token

**`publish-cli.yml`** — publish CLI to npm:
- Triggered by GitHub release creation
- Builds CLI, publishes to npm with `npm publish`
- Ensures version in `package.json` matches the release tag
