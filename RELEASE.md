# Release checklist

## Current release candidate

- Package: `planmode@0.5.0-beta.1`
- npm dist-tag: `next`
- Stable `latest`: `0.4.0`
- Scope: cross-client install targets plus `check`, `judge`, `guard`, and `loop`
- Status: prepared locally; **not published**

The beta is opt-in. A normal `npm install -g planmode` must continue to install
`0.4.0` until this checklist is complete.

## Non-negotiable safety rules

- Do not merge the release branch into `main` until the testbed and beta feedback
  are green.
- Do not create a GitHub release for this version until the preflight checks
  below pass.
- Do not run `npm publish` manually without `--tag next`.
- Do not publish harness packages yet. The harness install/trust path is not
  complete.
- Do not put real credentials, customer data, or production `.env` files in the
  testbed.

## Preflight

Run from the release branch:

```bash
cd cli
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

The private testbed must also pass:

- `planmode-testbed` CI against this branch
- install/render snapshots for Claude, Codex, and OpenCode
- the stable-vs-beta compatibility gate (`planmode@0.4.0` install output and
  lockfile compatibility)
- Cursor manual install check
- one real builder smoke run
- one optional semantic-review smoke run

Before publishing, verify the package contents do not include local test
artifacts, `.planmode` state, or secrets:

```bash
npm pack --dry-run
npm view planmode dist-tags
```

`latest` should still point at `0.4.0`.

## Publish the beta

Only after the preflight is green:

1. Push the release branch and open a draft PR for review.
2. Create a GitHub **prerelease** with tag `v0.5.0-beta.1`.
3. The publish workflow verifies the tag matches `cli/package.json`, runs the
   tests, and publishes with `--tag next`.
4. Confirm the dist-tags:
   ```bash
   npm view planmode dist-tags
   ```
   Expected: `latest: 0.4.0`, `next: 0.5.0-beta.1`.
5. Install the beta in a clean environment:
   ```bash
   npm install -g planmode@next
   planmode --version
   ```

## Beta feedback gate

Promote to `latest` only when:

- the testbed matrix is green
- the beta has been used on at least one real project
- OpenCode, Claude Code, and Codex smoke runs have passed
- Cursor has been checked manually
- no unresolved P0/P1 issues remain
- the release notes clearly describe the experimental status and the command
  execution/trust model

## Rollback

If the beta is bad, do not move `latest`. Deprecate it if necessary:

```bash
npm deprecate planmode@0.5.0-beta.1 "Broken beta; use 0.4.0"
```

If a stable release is ever published by mistake, move the tag back:

```bash
npm dist-tag add planmode@0.4.0 latest
npm deprecate planmode@0.5.0 "Broken release; use 0.4.0"
```

The publish workflow must never move `latest` for a version containing a
hyphen. That guard is covered by the workflow and should be tested before the
first prerelease.
