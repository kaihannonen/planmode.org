# Contributing to Planmode

Thanks for your interest in contributing to Planmode.

## Submitting a package

The easiest way to contribute is to add a package to the registry:

1. Fork this repository
2. Create a new directory under `registry/packages/<your-package-name>/`
3. Add the required files:
   - `planmode.yaml` — package manifest
   - `plan.md`, `rule.md`, or `prompt.md` — the content file
4. Open a pull request

See the [package spec](https://planmode.org/docs/spec) for the full `planmode.yaml` schema.

### Package guidelines

- Package names must be lowercase with hyphens only
- Descriptions should be concise (under 200 characters)
- Include useful, working content — not placeholders
- Tag appropriately (max 10 tags)
- Choose the correct type: `plan` for multi-step guides, `rule` for always-on constraints, `prompt` for single-use instructions

## Reporting bugs

Open an issue at [github.com/kaihannonen/planmode.org/issues](https://github.com/kaihannonen/planmode.org/issues).

Include:
- What you expected to happen
- What actually happened
- Steps to reproduce
- CLI version (`planmode --version`)

## Development setup

```bash
# Website
npm install
npm run dev

# CLI
cd cli
npm install
npm run build
npm link
```

## Code style

- TypeScript strict mode
- No `any` types
- Prefer explicit return types on exported functions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
