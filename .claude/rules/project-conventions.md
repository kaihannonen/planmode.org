# Project conventions

## Language and runtime

- TypeScript strict mode, ESM (`"type": "module"` in package.json)
- Use `.js` extensions in all import paths (TypeScript resolves them at compile time)
- Node.js >= 20 (native `fetch`, stable ESM)

## Monorepo structure

| Directory | What | Stack |
|-----------|------|-------|
| `cli/` | npm package (`planmode`) | TypeScript, tsup, commander, vitest |
| `src/` | Astro website (planmode.org) | Astro, Tailwind CSS |
| `registry/` | Package data | JSON (index.json, categories.json, packages/) |
| `worker/` | Cloudflare Worker (analytics API) | Hono, Cloudflare KV |
| `.github/workflows/` | CI/CD | GitHub Actions |

## Dependencies

- Prefer Node built-ins: `node:fs`, `node:path`, `node:os`, `node:child_process`, native `fetch`
- No new dependencies without justification
- Core CLI dependencies: `commander` (args), `@clack/prompts` (interactive UI), `yaml` (serialization), `handlebars` (templating), `simple-git` (git ops), `@modelcontextprotocol/sdk` + `zod` (MCP server)
- Testing: `vitest`
- Build: `tsup`

## Error handling

In CLI commands:

```typescript
try {
  // ... lib calls
} catch (err) {
  logger.error((err as Error).message);
  process.exit(1);
}
```

In lib modules: throw descriptive errors, never call `process.exit()`.

In MCP tools: catch errors and return `errorResult("prefix", err)`.

## Data formats

- YAML for all config and data files: lockfile (`planmode.lock`), context index, global config (`~/.planmode/config`)
- JSON only for registry metadata files (`index.json`, `metadata.json`, `versions/*.json`)
- Use `yaml` package's `parse()` and `stringify()` — never `JSON.parse`/`JSON.stringify` for config files

## CLI output

- Use `logger` from `cli/src/lib/logger.ts` for all output — never raw `console.log`
- `logger.info()`, `logger.success()`, `logger.error()`, `logger.warn()`, `logger.blank()`
- Logger supports capture mode (`logger.capture()` / `logger.flush()`) for MCP tool output collection

## Testing

- Test framework: vitest
- Test files mirror source structure: `cli/tests/commands/`, `cli/tests/lib/`
- Fixture data in `cli/tests/fixtures/`
- Run with `npm test` from `cli/` directory

## Website

- Astro with Tailwind CSS, deployed to Cloudflare Pages
- Color palette: `#0A0A0A` (bg), `#1A1A1A` (surfaces), `#E05555` (accent), `#C94444` (hover)
- Font: Inter (body), system monospace (code)
- Target Lighthouse 95+ across all categories
- Minimal client-side JS — use Astro islands for interactive components only
