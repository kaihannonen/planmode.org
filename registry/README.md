# Planmode Registry

The public package registry for [Planmode](https://planmode.org) — the open source package manager for AI plans, rules, and prompts.

## Structure

```
registry/
├── index.json           # Full package list (rebuilt automatically)
├── categories.json      # Packages grouped by category
├── packages/            # One directory per package
│   └── <name>/
│       ├── metadata.json
│       └── versions/
│           └── <version>.json
└── .github/workflows/   # CI automation
```

## How it works

- **`index.json`** is fetched and cached by the Planmode CLI for search and discovery
- **`metadata.json`** contains full package details (author, license, dependencies, variables)
- **`versions/<version>.json`** links to the source repository and specific git tag
- CI automatically validates PRs and rebuilds the index on merge

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to submit packages.

## License

MIT
