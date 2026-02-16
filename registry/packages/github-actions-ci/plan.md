# GitHub Actions CI/CD Pipeline

Set up a comprehensive GitHub Actions CI/CD pipeline with linting, testing, building, and deployment.

## Prerequisites

- A GitHub repository
- A Node.js/TypeScript project with `package.json`
- Tests configured (e.g., with Vitest or Jest)
- A linter configured (e.g., ESLint)

## Steps

### 1. Create the workflow directory

```bash
mkdir -p .github/workflows
```

### 2. Create the CI workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - run: npm ci

      - run: npm run lint

      - name: Check formatting
        run: npx prettier --check .

  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - run: npm ci

      - run: npx tsc --noEmit

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - run: npm ci

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
          retention-days: 7

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - run: npm ci

      - run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: dist/
          retention-days: 7
```

### 3. Create a deployment workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    # Only deploy from main branch
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: ${{ steps.deploy.outputs.url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - run: npm ci
      - run: npm run build

      - name: Deploy
        id: deploy
        run: |
          echo "Deploying to production..."
          # Replace with your deployment command:
          # npx wrangler pages deploy dist/ --project-name=my-project
          # or: npx vercel --prod
          # or: aws s3 sync dist/ s3://my-bucket/
          echo "url=https://your-app.com" >> $GITHUB_OUTPUT
```

### 4. Create a release workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  release:
    name: Create Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - run: npm ci
      - run: npm run build
      - run: npm test

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: |
            dist/**
```

### 5. Add branch protection rules

Go to your GitHub repository Settings > Branches > Add rule:

- Branch name pattern: `main`
- Require status checks to pass before merging:
  - `Lint`
  - `Type Check`
  - `Test`
  - `Build`
- Require branches to be up to date before merging
- Require pull request reviews (at least 1)

### 6. Add status badges to README

Add to the top of your `README.md`:

```markdown
[![CI](https://github.com/YOUR_USER/YOUR_REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USER/YOUR_REPO/actions/workflows/ci.yml)
```

### 7. Add required scripts to package.json

Ensure your `package.json` has these scripts:

```json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx",
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "build": "tsc && tsup"
  }
}
```

### 8. Test the pipeline

```bash
# Create a branch and push
git checkout -b test-ci
git add .github/workflows/
git commit -m "Add CI/CD workflows"
git push -u origin test-ci

# Open a pull request and watch the checks run
```

## What you get

- CI pipeline that runs lint, typecheck, test, and build on every PR
- Deployment workflow triggered on merge to main
- Release workflow triggered by version tags
- Concurrency controls to prevent duplicate runs
- Build artifacts uploaded for debugging
- Coverage reports preserved for 7 days
