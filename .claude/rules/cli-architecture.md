# CLI architecture

Every new CLI feature follows a 3-layer pattern: lib module, CLI command, and MCP tool. Interactive menu integration is added when the feature is user-facing.

## 1. Lib module (`cli/src/lib/*.ts`)

Pure logic, no UI. This is where all business logic lives.

- Import from `node:fs`, `node:path`, `yaml`, and typed interfaces from `../types/index.js`
- Use `logger` for any output (never `console.log`)
- Use `yaml` `parse()`/`stringify()` for all config/data serialization
- Accept `projectDir: string = process.cwd()` as the last parameter for any project-scoped function
- Return typed results — never print and exit from lib code
- Throw errors with descriptive messages (`throw new Error("Package '<name>' not found in registry.")`)
- Follow the lockfile pattern: read → modify → write (see `lib/lockfile.ts` for the canonical example)

Example signature:

```typescript
export function readLockfile(projectDir: string = process.cwd()): Lockfile {
```

## 2. CLI command (`cli/src/commands/*.ts`)

Thin Commander subcommand that wires args to lib calls.

- Export a `const fooCommand = new Command("foo")` with `.description()`, `.argument()`, `.option()`, `.action()`
- Branch on `isInteractive()` from `../lib/prompts.js`:
  - Interactive: wrap with `p.intro()` / `p.outro()` from `@clack/prompts`
  - Non-interactive: use `logger.blank()` for spacing
- Use `withSpinner()` for any async operation in interactive mode
- Error handling pattern — always:

```typescript
} catch (err) {
  logger.error((err as Error).message);
  process.exit(1);
}
```

- Register the command in `cli/src/index.ts`: `program.addCommand(fooCommand);`

## 3. MCP tool (`cli/src/mcp.ts`)

Mirror of the CLI command for AI agents.

- Register with `server.registerTool("planmode_foo", { ... })` using `z` (zod) schema for input
- Wrap all lib calls in `withCapture()` (sync) or `withCaptureAsync()` (async) to capture logger output
- Return `textResult()` on success, `errorResult("Failed to foo", err)` on failure
- Use `adaptError()` to rewrite CLI-specific messages for MCP context (e.g., replace "Run `planmode login`" with "Configure a GitHub token")
- Use `formatMessages()` to combine captured logger output with result text

## 4. Interactive menu (`cli/src/commands/interactive.ts`)

For user-facing features, add to the interactive menu.

- Add new action to the `Action` type union (e.g., `| "foo"`)
- Add a menu option in `mainMenu()` with value, label, and optional hint
- Create a `fooFlow()` async function using `@clack/prompts` widgets
- Use `handleCancel()` to wrap every prompt result for clean Ctrl+C handling
- Use `withSpinner()` for async operations within flows

## 5. Types (`cli/src/types/index.ts`)

All shared TypeScript interfaces live here.

- Group interfaces by section using `// ── Section ──` comment dividers
- Sections: Package manifest, Registry, Lockfile, Config, Context, Resolved package info
- Export all types as named exports (no default exports)
- Use strict types: `PackageType`, `VariableType`, `Category` are string literal unions, not plain strings
