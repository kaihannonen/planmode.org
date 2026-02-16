import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import type { Lockfile, LockfileEntry } from "../types/index.js";

const LOCKFILE_NAME = "planmode.lock";

export function getLockfilePath(projectDir: string = process.cwd()): string {
  return path.join(projectDir, LOCKFILE_NAME);
}

export function readLockfile(projectDir: string = process.cwd()): Lockfile {
  const lockfilePath = getLockfilePath(projectDir);
  try {
    const raw = fs.readFileSync(lockfilePath, "utf-8");
    const data = parse(raw) as Lockfile;
    return data ?? { lockfile_version: 1, packages: {} };
  } catch {
    return { lockfile_version: 1, packages: {} };
  }
}

export function writeLockfile(lockfile: Lockfile, projectDir: string = process.cwd()): void {
  const lockfilePath = getLockfilePath(projectDir);
  fs.writeFileSync(lockfilePath, stringify(lockfile), "utf-8");
}

export function addToLockfile(
  packageName: string,
  entry: LockfileEntry,
  projectDir: string = process.cwd(),
): void {
  const lockfile = readLockfile(projectDir);
  lockfile.packages[packageName] = entry;
  writeLockfile(lockfile, projectDir);
}

export function removeFromLockfile(
  packageName: string,
  projectDir: string = process.cwd(),
): void {
  const lockfile = readLockfile(projectDir);
  delete lockfile.packages[packageName];
  writeLockfile(lockfile, projectDir);
}

export function getLockedVersion(
  packageName: string,
  projectDir: string = process.cwd(),
): LockfileEntry | undefined {
  const lockfile = readLockfile(projectDir);
  return lockfile.packages[packageName];
}

export function getDependents(
  packageName: string,
  projectDir: string = process.cwd(),
): string[] {
  // Check which installed packages depend on the given package
  // This is a simplified check — in a full implementation we'd read manifests
  const lockfile = readLockfile(projectDir);
  return Object.keys(lockfile.packages).filter((name) => name !== packageName);
}
