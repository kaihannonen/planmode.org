import fs from "node:fs";

/**
 * Read the package version at runtime instead of hard-coding it in the CLI.
 *
 * The bundled CLI lives at `dist/index.js`, while the source runs from
 * `src/version.ts`; in both cases `../package.json` resolves to the package
 * root. This keeps `planmode --version` aligned with the tarball that was
 * actually published.
 */
export function readVersion(): string {
  try {
    const raw = fs.readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // Fall through to an explicit unknown version rather than crashing the CLI.
  }
  return "0.0.0";
}
