import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import { runCi } from "../../src/lib/ci.js";
import { createTmpDir, writeFile, writeLockfile, computeHash } from "../helpers.js";
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

describe("runCi", () => {
  it("fails when planmode.lock is missing", () => {
    const dir = useTmpDir();
    const result = runCi({ projectDir: dir });
    expect(result.passed).toBe(false);
    expect(result.issues[0]!.code).toBe("lockfile");
    expect(result.issues[0]!.message).toContain("No planmode.lock found");
  });

  it("passes when the lockfile and generated files match", () => {
    const dir = useTmpDir();
    const content = "# My Plan";
    writeFile(dir, "plans/my-plan.md", content);
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/my-plan.md\n");
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: { "my-plan": makePlanEntry("my-plan", content) },
    });

    const result = runCi({ projectDir: dir });
    expect(result.passed).toBe(true);
    expect(result.packagesChecked).toBe(1);
    expect(result.issues).toHaveLength(0);
  });

  it("fails on a content hash mismatch", () => {
    const dir = useTmpDir();
    const original = "# Original";
    writeFile(dir, "plans/my-plan.md", "# Modified locally");
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/my-plan.md\n");
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: { "my-plan": makePlanEntry("my-plan", original) },
    });

    const result = runCi({ projectDir: dir });
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === "hash" && issue.severity === "error")).toBe(true);
  });

  it("fails on invalid lockfile YAML", () => {
    const dir = useTmpDir();
    fs.writeFileSync(`${dir}/planmode.lock`, ":\n: [invalid", "utf-8");
    const result = runCi({ projectDir: dir });
    expect(result.passed).toBe(false);
    expect(result.issues[0]!.message).toContain("Invalid planmode.lock");
  });

  it("passes with warnings by default but fails with --strict", () => {
    const dir = useTmpDir();
    writeFile(dir, "plans/manual.md", "# Manual plan");
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/manual.md\n");
    writeLockfile(dir, { lockfile_version: 1, packages: {} });

    const normal = runCi({ projectDir: dir });
    expect(normal.passed).toBe(true);
    expect(normal.issues.some((issue) => issue.severity === "warning")).toBe(true);

    const strict = runCi({ projectDir: dir, strict: true });
    expect(strict.passed).toBe(false);
  });
});
