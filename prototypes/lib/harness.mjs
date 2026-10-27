import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const YAML = require("../../cli/node_modules/yaml");

export const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
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

export function expandBraces(pattern) {
  const match = pattern.match(/\{([^{}]+)\}/);
  if (!match) return [pattern];
  const [full, inner] = match;
  return inner
    .split(",")
    .flatMap((part) => expandBraces(pattern.replace(full, part)));
}

export function globToRegExp(glob) {
  const alternatives = expandBraces(glob).map((source) => {
    let out = "";
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
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

export function walkFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        stack.push(path.join(current, entry.name));
      } else if (entry.isFile()) {
        files.push(path.join(current, entry.name));
      }
    }
  }
  return files.sort();
}

export function loadManifest(dir) {
  const manifestPath = path.join(dir, "harness.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`missing harness.yaml in ${dir}`);
  }
  const manifest = YAML.parse(fs.readFileSync(manifestPath, "utf8"));
  return { manifest, manifestPath };
}

export function listHarnesses(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => path.join(root, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, "harness.yaml")))
    .sort();
}

export function formatPath(value) {
  return value.split(path.sep).join("/");
}
