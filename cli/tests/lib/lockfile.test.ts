import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import {
  readLockfile,
  writeLockfile,
  addToLockfile,
  removeFromLockfile,
  getLockedVersion,
  getDependents,
} from "../../src/lib/lockfile.js";
import { createTmpDir } from "../helpers.js";
import type { LockfileEntry } from "../../src/types/index.js";

let tmpDirs: string[] = [];

function useTmpDir(): string {
  const dir = createTmpDir();
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

const sampleEntry: LockfileEntry = {
  version: "1.0.0",
  type: "plan",
  source: "github.com/user/repo",
  tag: "v1.0.0",
  sha: "abc123",
  content_hash: "sha256:deadbeef",
  installed_to: "plans/my-plan.md",
};

// ── readLockfile ──

describe("readLockfile", () => {
  it("returns default lockfile for empty directory", () => {
    const dir = useTmpDir();
    const lockfile = readLockfile(dir);
    expect(lockfile.lockfile_version).toBe(1);
    expect(lockfile.packages).toEqual({});
  });

  it("parses an existing lockfile", () => {
    const dir = useTmpDir();
    writeLockfile({ lockfile_version: 1, packages: { "my-plan": sampleEntry } }, dir);
    const lockfile = readLockfile(dir);
    expect(lockfile.packages["my-plan"]?.version).toBe("1.0.0");
  });

  it("returns default for invalid YAML", () => {
    const dir = useTmpDir();
    fs.writeFileSync(`${dir}/planmode.lock`, ":\n: [invalid", "utf-8");
    // readLockfile catches parse errors and returns default
    const lockfile = readLockfile(dir);
    expect(lockfile.lockfile_version).toBe(1);
  });
});

// ── writeLockfile + readLockfile round-trip ──

describe("writeLockfile", () => {
  it("round-trips correctly", () => {
    const dir = useTmpDir();
    const original = {
      lockfile_version: 1,
      packages: { "my-plan": sampleEntry, "my-rule": { ...sampleEntry, type: "rule" as const } },
    };
    writeLockfile(original, dir);
    const result = readLockfile(dir);
    expect(result.packages["my-plan"]?.version).toBe("1.0.0");
    expect(result.packages["my-rule"]?.type).toBe("rule");
  });
});

// ── addToLockfile ──

describe("addToLockfile", () => {
  it("adds entry to empty lockfile", () => {
    const dir = useTmpDir();
    addToLockfile("new-pkg", sampleEntry, dir);
    const lockfile = readLockfile(dir);
    expect(lockfile.packages["new-pkg"]?.version).toBe("1.0.0");
  });

  it("adds entry without disturbing existing entries", () => {
    const dir = useTmpDir();
    addToLockfile("first", sampleEntry, dir);
    addToLockfile("second", { ...sampleEntry, version: "2.0.0" }, dir);
    const lockfile = readLockfile(dir);
    expect(lockfile.packages["first"]?.version).toBe("1.0.0");
    expect(lockfile.packages["second"]?.version).toBe("2.0.0");
  });
});

// ── removeFromLockfile ──

describe("removeFromLockfile", () => {
  it("removes an existing entry", () => {
    const dir = useTmpDir();
    addToLockfile("to-remove", sampleEntry, dir);
    removeFromLockfile("to-remove", dir);
    const lockfile = readLockfile(dir);
    expect(lockfile.packages["to-remove"]).toBeUndefined();
  });

  it("does not fail when removing non-existent package", () => {
    const dir = useTmpDir();
    addToLockfile("keep", sampleEntry, dir);
    removeFromLockfile("nonexistent", dir);
    const lockfile = readLockfile(dir);
    expect(lockfile.packages["keep"]?.version).toBe("1.0.0");
  });
});

// ── getLockedVersion ──

describe("getLockedVersion", () => {
  it("returns the entry when found", () => {
    const dir = useTmpDir();
    addToLockfile("my-pkg", sampleEntry, dir);
    const entry = getLockedVersion("my-pkg", dir);
    expect(entry?.version).toBe("1.0.0");
  });

  it("returns undefined when not found", () => {
    const dir = useTmpDir();
    const entry = getLockedVersion("missing", dir);
    expect(entry).toBeUndefined();
  });
});

// ── getDependents ──

describe("getDependents", () => {
  it("returns other package names from the lockfile", () => {
    const dir = useTmpDir();
    addToLockfile("pkg-a", sampleEntry, dir);
    addToLockfile("pkg-b", sampleEntry, dir);
    addToLockfile("pkg-c", sampleEntry, dir);
    const dependents = getDependents("pkg-a", dir);
    expect(dependents).toContain("pkg-b");
    expect(dependents).toContain("pkg-c");
    expect(dependents).not.toContain("pkg-a");
  });
});
