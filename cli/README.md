# planmode

The open source package manager for AI plans, rules, and prompts.

**Website:** [planmode.org](https://planmode.org)
**Repository:** [github.com/kaihannonen/planmode.org](https://github.com/kaihannonen/planmode.org)

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

# Run a templated prompt
planmode run rest-api-generator --resource users --framework express

# See what's installed
planmode list
```

## Use with Claude Code (MCP)

Planmode includes an MCP server that lets Claude Code search, install, preview, and manage packages directly from your conversations.

```bash
# One-time setup
planmode mcp setup
```

Once registered, Claude has access to 17 tools including `planmode_search`, `planmode_install`, `planmode_preview`, `planmode_read`, `planmode_doctor`, and more. Installed packages are also exposed as MCP resources that Claude can browse automatically.

Ask Claude things like:
- "Search planmode for a Next.js starter plan"
- "Preview the typescript-strict rule before installing"
- "Run a health check on my planmode packages"

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
| `planmode record start\|stop` | Generate a plan from git commits |
| `planmode snapshot` | Generate a plan from existing project setup |

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
