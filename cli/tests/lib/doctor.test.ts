import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import { runDoctor } from "../../src/lib/doctor.js";
import { createTmpDir, writeFile, writeLockfile, computeHash } from "../helpers.js";
import type { Lockfile, LockfileEntry } from "../../src/types/index.js";

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

function makePlanEntry(name: string, content: string): LockfileEntry {
  return {
    version: "1.0.0",
    type: "plan",
    source: "github.com/user/repo",
    tag: "v1.0.0",
    sha: "abc123",
    content_hash: computeHash(content),
    installed_to: `plans/${name}.md`,
  };
}

function makeRuleEntry(name: string, content: string): LockfileEntry {
  return {
    version: "1.0.0",
    type: "rule",
    source: "github.com/user/repo",
    tag: "v1.0.0",
    sha: "abc123",
    content_hash: computeHash(content),
    installed_to: `.claude/rules/${name}.md`,
  };
}

// ── healthy project ──

describe("runDoctor — healthy project", () => {
  it("reports healthy when all files match", () => {
    const dir = useTmpDir();
    const content = "# My Plan\n\nSteps...";
    writeFile(dir, "plans/my-plan.md", content);
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/my-plan.md\n");
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: { "my-plan": makePlanEntry("my-plan", content) },
    });
    const result = runDoctor(dir);
    expect(result.healthy).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.packagesChecked).toBe(1);
  });

  it("reports healthy with no packages installed", () => {
    const dir = useTmpDir();
    const result = runDoctor(dir);
    expect(result.healthy).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.packagesChecked).toBe(0);
  });
});

// ── missing files ──

describe("runDoctor — missing files", () => {
  it("reports error for missing plan file", () => {
    const dir = useTmpDir();
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/missing.md\n");
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: { missing: makePlanEntry("missing", "content") },
    });
    const result = runDoctor(dir);
    expect(result.healthy).toBe(false);
    const error = result.issues.find((i) => i.severity === "error" && i.message.includes("Missing file"));
    expect(error).toBeDefined();
    expect(error!.fix).toContain("planmode install");
  });
});

// ── hash mismatch ──

describe("runDoctor — hash mismatch", () => {
  it("warns when file content differs from lockfile hash", () => {
    const dir = useTmpDir();
    const original = "original content";
    const modified = "modified content";
    writeFile(dir, "plans/my-plan.md", modified);
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/my-plan.md\n");
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: { "my-plan": makePlanEntry("my-plan", original) },
    });
    const result = runDoctor(dir);
    // Hash mismatch is a warning, not an error — project is still "healthy"
    expect(result.healthy).toBe(true);
    const warning = result.issues.find((i) => i.severity === "warning" && i.message.includes("hash mismatch"));
    expect(warning).toBeDefined();
  });
});

// ── CLAUDE.md sync ──

describe("runDoctor — CLAUDE.md sync", () => {
  it("reports error when plan is installed but missing from CLAUDE.md imports", () => {
    const dir = useTmpDir();
    const content = "# Plan content";
    writeFile(dir, "plans/my-plan.md", content);
    writeFile(dir, "CLAUDE.md", "# Planmode\n");
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: { "my-plan": makePlanEntry("my-plan", content) },
    });
    const result = runDoctor(dir);
    expect(result.healthy).toBe(false);
    expect(result.issues.some((i) => i.message.includes("missing from CLAUDE.md"))).toBe(true);
  });

  it("reports error when CLAUDE.md import references non-existent file", () => {
    const dir = useTmpDir();
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/ghost.md\n");
    writeLockfile(dir, { lockfile_version: 1, packages: {} });
    const result = runDoctor(dir);
    expect(result.healthy).toBe(false);
    expect(result.issues.some((i) => i.message.includes("ghost") && i.message.includes("doesn't exist"))).toBe(true);
  });

  it("warns when CLAUDE.md import is not tracked in lockfile but file exists", () => {
    const dir = useTmpDir();
    writeFile(dir, "plans/manual.md", "# Manually added plan");
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/manual.md\n");
    writeLockfile(dir, { lockfile_version: 1, packages: {} });
    const result = runDoctor(dir);
    // File exists but not in lockfile — warning only
    expect(result.healthy).toBe(true);
    expect(result.issues.some((i) => i.severity === "warning" && i.message.includes("not tracked"))).toBe(true);
  });

  it("reports error when CLAUDE.md is missing but plans are installed", () => {
    const dir = useTmpDir();
    const content = "# Plan content";
    writeFile(dir, "plans/my-plan.md", content);
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: { "my-plan": makePlanEntry("my-plan", content) },
    });
    const result = runDoctor(dir);
    expect(result.healthy).toBe(false);
    expect(result.issues.some((i) => i.message.includes("CLAUDE.md is missing"))).toBe(true);
  });
});

// ── orphaned files ──

describe("runDoctor — orphaned files", () => {
  it("warns about untracked plan files", () => {
    const dir = useTmpDir();
    writeFile(dir, "plans/orphan.md", "# Orphaned plan");
    writeLockfile(dir, { lockfile_version: 1, packages: {} });
    const result = runDoctor(dir);
    expect(result.healthy).toBe(true);
    expect(result.issues.some((i) => i.severity === "warning" && i.message.includes("Untracked"))).toBe(true);
  });

  it("does not flag tracked plan files as orphaned", () => {
    const dir = useTmpDir();
    const content = "# Tracked plan";
    writeFile(dir, "plans/tracked.md", content);
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/tracked.md\n");
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: { tracked: makePlanEntry("tracked", content) },
    });
    const result = runDoctor(dir);
    expect(result.issues.filter((i) => i.message.includes("Untracked"))).toHaveLength(0);
  });
});

// ── rules without CLAUDE.md import check ──

describe("runDoctor — rules", () => {
  it("does not require CLAUDE.md import for rules", () => {
    const dir = useTmpDir();
    const content = "# Rule content";
    writeFile(dir, ".claude/rules/my-rule.md", content);
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: { "my-rule": makeRuleEntry("my-rule", content) },
    });
    const result = runDoctor(dir);
    expect(result.healthy).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
