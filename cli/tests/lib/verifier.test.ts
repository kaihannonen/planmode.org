import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import { stringify } from "yaml";
import { verifyPackages } from "../../src/lib/verifier.js";
import { createTmpDir, writeFile, writeLockfile, validManifest, computeHash } from "../helpers.js";
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

function makeEntry(overrides: Partial<LockfileEntry> = {}): LockfileEntry {
  return {
    version: "1.0.0",
    type: "plan",
    source: "github.com/user/repo",
    tag: "v1.0.0",
    sha: "abc123",
    content_hash: computeHash("# Plan"),
    installed_to: "plans/my-plan.md",
    ...overrides,
  };
}

describe("verifyPackages", () => {
  it("runs verification commands from the lockfile", async () => {
    const dir = useTmpDir();
    const command = `node -e "console.log('verified')"`;
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: {
        "my-plan": makeEntry({
          verification: { commands: [{ name: "smoke", run: command }] },
        }),
      },
    });

    const results = await verifyPackages({ projectDir: dir });
    expect(results).toHaveLength(1);
    expect(results[0]!.packageName).toBe("my-plan");
    expect(results[0]!.passed).toBe(true);
    expect(results[0]!.commands[0]!.status).toBe("passed");
    expect(results[0]!.commands[0]!.stdout).toContain("verified");
  });

  it("reports a failing command with its exit code", async () => {
    const dir = useTmpDir();
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: {
        "my-plan": makeEntry({
          verification: {
            commands: [{ name: "failing", run: `node -e "process.exit(3)"` }],
          },
        }),
      },
    });

    const results = await verifyPackages({ projectDir: dir });
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.commands[0]!.status).toBe("failed");
    expect(results[0]!.commands[0]!.exitCode).toBe(3);
  });

  it("does not run commands in dry-run mode", async () => {
    const dir = useTmpDir();
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: {
        "my-plan": makeEntry({
          verification: {
            commands: [{ name: "smoke", run: `node -e "console.log('should not run')"` }],
          },
        }),
      },
    });

    const results = await verifyPackages({ projectDir: dir, dryRun: true });
    expect(results[0]!.commands[0]!.status).toBe("skipped");
    expect(results[0]!.commands[0]!.stdout).toBe("");
    expect(results[0]!.passed).toBe(true);
  });

  it("verifies a specific installed package", async () => {
    const dir = useTmpDir();
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: {
        "plan-a": makeEntry({
          verification: { commands: [{ name: "a", run: `node -e "console.log('a')"` }] },
        }),
        "plan-b": makeEntry({
          verification: { commands: [{ name: "b", run: `node -e "console.log('b')"` }] },
        }),
      },
    });

    const results = await verifyPackages({ projectDir: dir, packageName: "plan-b" });
    expect(results).toHaveLength(1);
    expect(results[0]!.packageName).toBe("plan-b");
    expect(results[0]!.commands[0]!.name).toBe("b");
  });

  it("uses the local manifest when run in a package directory", async () => {
    const dir = useTmpDir();
    writeFile(
      dir,
      "planmode.yaml",
      stringify(validManifest({
        name: "local-plan",
        verification: { commands: [{ name: "local", run: `node -e "console.log('local')"` }] },
      })),
    );

    const results = await verifyPackages({ projectDir: dir });
    expect(results).toHaveLength(1);
    expect(results[0]!.packageName).toBe("local-plan");
    expect(results[0]!.commands[0]!.stdout).toContain("local");
  });

  it("throws when the package has no verification commands", async () => {
    const dir = useTmpDir();
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: { "my-plan": makeEntry() },
    });

    await expect(verifyPackages({ projectDir: dir, packageName: "my-plan" }))
      .rejects.toThrow("does not define verification commands");
  });

  it("throws when no installed package has verification commands", async () => {
    const dir = useTmpDir();
    writeLockfile(dir, {
      lockfile_version: 1,
      packages: { "my-plan": makeEntry() },
    });

    await expect(verifyPackages({ projectDir: dir }))
      .rejects.toThrow("No verification commands found");
  });

  it("throws when a requested package is not installed", async () => {
    const dir = useTmpDir();
    await expect(verifyPackages({ projectDir: dir, packageName: "missing" }))
      .rejects.toThrow("not installed");
  });
});
