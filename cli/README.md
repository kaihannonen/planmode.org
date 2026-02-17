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
