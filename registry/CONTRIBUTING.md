# Contributing to the Planmode Registry

Thank you for contributing! This guide explains how to submit packages to the public registry.

## Submitting a package

### Option 1: Using the CLI (recommended)

```bash
# In your package directory
planmode publish
```

This automatically validates your manifest, creates a git tag, forks this repo, and opens a PR.

### Option 2: Manual PR

1. Fork this repository
2. Create a directory under `packages/` matching your package name
3. Add `metadata.json` with full package metadata
4. Add version files under `versions/` for each version
5. Open a PR to `main`

## Package structure

```
packages/
└── your-package-name/
    ├── metadata.json
    └── versions/
        └── 1.0.0.json
```

## metadata.json required fields

| Field | Description |
|-------|-------------|
| `name` | Unique package name (lowercase, hyphens only) |
| `description` | Short description (max 200 chars) |
| `author` | GitHub username |
| `license` | SPDX license identifier |
| `type` | `prompt`, `rule`, or `plan` |
| `latest_version` | Current version |
| `versions` | Array of all published versions |

## Validation

PRs are automatically validated by CI. The checks include:

- Valid JSON syntax
- All required fields present
- Package name matches directory name
- Name format is valid
- Version files exist for all listed versions

## Guidelines

- Package names must be lowercase with hyphens only
- Descriptions should be clear and under 200 characters
- Include meaningful tags for discoverability
- Use semver for versioning
- Ensure your source repository is accessible

## Code of conduct

Be respectful and constructive. We're all here to make AI-assisted development better.
