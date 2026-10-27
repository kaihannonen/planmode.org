import fs from "node:fs";
import path from "node:path";
import { formatPath, globToRegExp, hashFile } from "../checks/glob.js";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "out",
  "target",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  "coverage",
  ".turbo",
  ".astro",
]);

function hasGlob(value: string): boolean {
  return /[*?{]/.test(value);
}

function walkAll(root: string): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(path.join(current, entry.name));
      } else if (entry.isFile()) {
        files.push(path.join(current, entry.name));
      }
    }
  }
  return files.sort();
}

/**
 * Snapshot the files matched by protected patterns. Exact paths may be files
 * or directories; glob patterns are matched relative to the workspace root.
 */
export function snapshotProtected(
  root: string,
  patterns: string[],
): Record<string, string> {
  const allFiles = walkAll(root);
  const selected = new Set<string>();

  for (const rawPattern of patterns) {
    const pattern = formatPath(rawPattern.trim());
    if (!pattern) continue;

    if (hasGlob(pattern)) {
      const matcher = globToRegExp(pattern);
      for (const file of allFiles) {
        const relative = formatPath(path.relative(root, file));
        if (matcher.test(relative)) selected.add(relative);
      }
      continue;
    }

    const full = path.resolve(root, pattern);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      for (const file of walkAll(full)) {
        selected.add(formatPath(path.relative(root, file)));
      }
    } else if (stat.isFile()) {
      selected.add(pattern);
    }
  }

  const snapshot: Record<string, string> = {};
  for (const relative of [...selected].sort()) {
    const full = path.join(root, relative);
    try {
      snapshot[relative] = hashFile(full);
    } catch {
      // A broken symlink or race is reported as a change on the next snapshot.
    }
  }
  return snapshot;
}

export function diffProtected(
  before: Record<string, string>,
  after: Record<string, string>,
): string[] {
  const changed = new Set<string>();
  for (const [file, hash] of Object.entries(after)) {
    if (before[file] !== hash) changed.add(file);
  }
  for (const file of Object.keys(before)) {
    if (!(file in after)) changed.add(file);
  }
  return [...changed].sort();
}
