# planmode

The open source package manager for AI plans, rules, and prompts.

**Website:** [planmode.org](https://planmode.org)
**CLI:** [npm](https://www.npmjs.com/package/planmode)
**License:** MIT

## What is Planmode?

Developers share code through npm, pip, cargo. But AI instructions — the plans, rules, and prompts that drive AI-assisted development — have no equivalent. Planmode fixes that.

```bash
npm install -g planmode
planmode install nextjs-tailwind-starter
```

That's it. The plan lands in your project, `CLAUDE.md` gets updated, and Claude Code picks it up automatically.

## Package types

| Type | What it is | Where it lives | Lifecycle |
|------|-----------|---------------|-----------|
| **Plan** | Multi-step implementation guide | `plans/*.md` | Active during task |
| **Rule** | Always-on constraint | `.claude/rules/*.md` | Permanent |
| **Prompt** | Fire-once instruction | `prompts/*.md` | Single use |

## Quick start

```bash
# Install the CLI
npm install -g planmode

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

## CLI commands

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

## Project structure

```
planmode.org/
├── src/              # Astro website (planmode.org)
│   ├── pages/        # Homepage, packages, docs
│   ├── components/   # Astro components
│   ├── layouts/      # Base + docs layouts
│   ├── styles/       # Tailwind v4 global CSS
│   └── data/         # Mock package data
├── cli/              # CLI tool (npm: planmode)
│   ├── src/
│   │   ├── commands/ # install, search, publish, etc.
│   │   ├── lib/      # registry, resolver, installer, etc.
│   │   └── types/    # TypeScript types
│   └── package.json
├── registry/         # Package registry (JSON + content)
│   ├── index.json
│   ├── categories.json
│   └── packages/     # 12 seed packages with manifests
└── .github/workflows # CI, deploy, npm publish
```

## Tech stack

**Website:** Astro, Tailwind CSS v4, Fuse.js, Cloudflare Pages
**CLI:** TypeScript, Commander, Handlebars, simple-git, tsup
**Registry:** Static JSON on GitHub, GitHub Actions CI

## Development

```bash
# Website
npm install
npm run dev          # http://localhost:4321

# CLI
cd cli
npm install
npm run build
npm link             # makes `planmode` available globally
```

## Publishing a package

```bash
# Create a new package
mkdir my-plan && cd my-plan
planmode init

# Edit your content
# ...

# Publish
planmode login --gh
planmode publish
```

See the [publishing guide](https://planmode.org/docs/publishing) for details.

## Contributing

Contributions welcome. The registry accepts new packages via pull request — add your package to `registry/packages/` and open a PR.

## License

MIT
