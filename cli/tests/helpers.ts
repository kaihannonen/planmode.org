import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { stringify } from "yaml";
import type { PackageManifest, Lockfile } from "../src/types/index.js";

export function validManifest(
  overrides: Partial<PackageManifest> = {},
): PackageManifest {
  return {
    name: "test-package",
    version: "1.0.0",
    type: "plan",
    description: "A test package",
    author: "testuser",
    license: "MIT",
    ...overrides,
  };
}

export function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "planmode-test-"));
}

export function writeFile(dir: string, relativePath: string, content: string): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
}

export function writeLockfile(dir: string, lockfile: Lockfile): void {
  fs.writeFileSync(path.join(dir, "planmode.lock"), stringify(lockfile), "utf-8");
}

export function computeHash(content: string): string {
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}
