import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".planmode",
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

const IGNORED_FILES = new Set([
  ".eslintcache",
  ".stylelintcache",
  ".DS_Store",
  "next-env.d.ts",
]);

export function isIgnoredFile(name: string): boolean {
  return IGNORED_FILES.has(name) || name.endsWith(".tsbuildinfo");
}

export function expandBraces(pattern: string): string[] {
  const match = pattern.match(/\{([^{}]+)\}/);
  if (!match) return [pattern];
  const [full, inner] = match;
  return inner
    .split(",")
    .flatMap((part) => expandBraces(pattern.replace(full, part)));
}

export function globToRegExp(glob: string): RegExp {
  const alternatives = expandBraces(glob).map((source) => {
    let out = "";
    for (let i = 0; i < source.length; i++) {
      const char = source[i]!;
      if (char === "*") {
        if (source[i + 1] === "*") {
          if (source[i + 2] === "/") {
            out += "(?:[^/]+/)*";
            i += 2;
          } else {
            out += ".*";
            i += 1;
          }
        } else {
          out += "[^/]*";
        }
      } else if (char === "?") {
        out += "[^/]";
      } else if (".+^$()|[]{}\\".includes(char)) {
        out += `\\${char}`;
      } else {
        out += char;
      }
    }
    return out;
  });
  return new RegExp(`^(?:${alternatives.join("|")})$`);
}

export function formatPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function walkFiles(root: string): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        stack.push(path.join(current, entry.name));
      } else if (entry.isFile() && !isIgnoredFile(entry.name)) {
        files.push(path.join(current, entry.name));
      }
    }
  }
  return files.sort();
}

export function hashFile(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function snapshotDir(root: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const file of walkFiles(root)) {
    snapshot[formatPath(path.relative(root, file))] = hashFile(file);
  }
  return snapshot;
}

export function changedFilesFromSnapshots(
  base: Record<string, string>,
  target: Record<string, string>,
): string[] {
  const changed = new Set<string>();
  for (const [file, hash] of Object.entries(target)) {
    if (base[file] !== hash) changed.add(file);
  }
  for (const file of Object.keys(base)) {
    if (!(file in target)) changed.add(file);
  }
  return [...changed].sort();
}
