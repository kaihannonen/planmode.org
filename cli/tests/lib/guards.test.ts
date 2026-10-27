import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  addGuard,
  proposeGuards,
  verifyGuard,
} from "../../src/lib/checks/guards.js";
import { readGuards } from "../../src/lib/checks/config.js";
import { runCheck } from "../../src/lib/checks/run.js";
import type { GuardDefinition } from "../../src/lib/checks/types.js";
import { createTmpDir, writeFile } from "../helpers.js";

let tmpDirs: string[] = [];

function useTmpDir(): string {
  const dir = createTmpDir();
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

function guard(overrides: Partial<GuardDefinition> = {}): GuardDefinition {
  return {
    id: "prevent-console-log",
    reason: "A debug console.log shipped in a production path",
    source: "bug:demo-123",
    created_at: "2026-10-27T00:00:00.000Z",
    severity: "error",
    check: {
      kind: "grep-absent",
      path: "src",
      glob: "**/*.ts",
      pattern: "console\\.log",
    },
    fixtures: {
      bad: "fixtures/bad",
      good: "fixtures/good",
    },
    verified: false,
    ...overrides,
  };
}

function writeFixtures(dir: string): void {
  writeFile(dir, "fixtures/bad/src/a.ts", "console.log('leak');\n");
  writeFile(dir, "fixtures/good/src/a.ts", "export const ok = true;\n");
}

describe("guard verification", () => {
  it("proves a guard fails on bad and passes on good", () => {
    const dir = useTmpDir();
    writeFixtures(dir);
    const verification = verifyGuard(guard(), dir);
    expect(verification.verified).toBe(true);
    expect(verification.bad?.status).toBe("fail");
    expect(verification.good?.status).toBe("pass");
  });

  it("rejects a guard that passes the bad fixture", () => {
    const dir = useTmpDir();
    writeFile(dir, "fixtures/bad/src/a.ts", "export const ok = true;\n");
    writeFile(dir, "fixtures/good/src/a.ts", "export const ok = true;\n");
    const verification = verifyGuard(guard(), dir);
    expect(verification.verified).toBe(false);
    expect(verification.issues.join(" ")).toMatch(/does not catch the bug/);
  });

  it("rejects a vacuous guard whose bad fixture matches no files", () => {
    const dir = useTmpDir();
    writeFile(dir, "fixtures/bad/src/readme.md", "nothing to scan\\n");
    writeFile(dir, "fixtures/good/src/a.ts", "export const ok = true;\\n");
    const verification = verifyGuard(guard(), dir);
    expect(verification.verified).toBe(false);
    expect(verification.issues.join(" ")).toMatch(/vacuous/);
  });

  it("rejects a guard with false positives", () => {
    const dir = useTmpDir();
    writeFile(dir, "fixtures/bad/src/a.ts", "console.log('leak');\n");
    writeFile(dir, "fixtures/good/src/a.ts", "console.log('also leaks');\n");
    const verification = verifyGuard(guard(), dir);
    expect(verification.verified).toBe(false);
    expect(verification.issues.join(" ")).toMatch(/false positives/);
  });

  it("does not add unverified guards without --force", () => {
    const dir = useTmpDir();
    writeFixtures(dir);
    expect(() =>
      addGuard({
        targetDir: dir,
        guard: guard({
          fixtures: { bad: "fixtures/missing", good: "fixtures/good" },
        }),
      }),
    ).toThrow(/not proven to discriminate/);
  });

  it("writes a verified guard and includes it in checks", () => {
    const dir = useTmpDir();
    writeFixtures(dir);
    writeFile(dir, "harness.yaml", "name: guard-harness\nevals: []\n");

    const { file } = addGuard({ targetDir: dir, guard: guard() });
    expect(fs.existsSync(file)).toBe(true);
    expect(readGuards(dir).guards).toHaveLength(1);

    writeFile(dir, "src/a.ts", "console.log('regression');\n");
    const report = runCheck({ targetDir: dir });
    const result = report.results.find(
      (item) => item.name === "guard:prevent-console-log",
    );
    expect(result?.status).toBe("fail");
    expect(report.new_failures).toContain("guard:prevent-console-log");
  });

  it("runs guards without a harness", () => {
    const dir = useTmpDir();
    writeFixtures(dir);
    addGuard({ targetDir: dir, guard: guard() });
    writeFile(dir, "src/a.ts", "export const ok = true;\n");

    const report = runCheck({ targetDir: dir });
    expect(report.harness).toBe("guards");
    expect(
      report.results.find(
        (result) => result.name === "guard:prevent-console-log",
      )?.status,
    ).toBe("pass");
  });

  it("marks forced unverified guards as not verified in checks", () => {
    const dir = useTmpDir();
    writeFile(dir, "harness.yaml", "name: guard-harness\nevals: []\n");
    writeFile(dir, "src/a.ts", "export const ok = true;\n");
    addGuard({
      targetDir: dir,
      guard: guard({ fixtures: undefined }),
      force: true,
    });

    const report = runCheck({ targetDir: dir });
    expect(report.not_verified.join(" ")).toMatch(
      /not verified against bad\/good fixtures/,
    );
  });
});

describe("proposed guards", () => {
  it("turns failed checks into guard definitions", () => {
    const dir = useTmpDir();
    writeFile(
      dir,
      "harness.yaml",
      [
        "name: proposal-harness",
        "evals:",
        "  - name: no-console-log",
        "    kind: grep-absent",
        "    path: src",
        '    glob: "**/*.ts"',
        "    pattern: 'console\\.log'",
        "    allow_empty: true",
        "",
      ].join("\n"),
    );
    writeFile(dir, "src/a.ts", "console.log('leak');\n");

    const report = runCheck({ targetDir: dir });
    expect(report.suggested_guards).toHaveLength(1);
    expect(report.suggested_guards[0]?.id).toBe("prevent-no-console-log");
    expect(report.suggested_guards[0]?.check.pattern).toBe("console\\.log");
    expect(report.suggested_guards[0]?.check.allow_empty).toBeUndefined();
  });

  it("can propose guards directly from failed results", () => {
    const proposals = proposeGuards(
      [
        {
          result: {
            name: "no-raw-sql",
            kind: "grep-absent",
            severity: "error",
            status: "fail",
            detail: "1 match",
            duration_ms: 1,
          },
          definition: {
            name: "no-raw-sql",
            kind: "grep-absent",
            path: "internal",
            glob: "**/*.go",
            pattern: '\\.Query\\("',
          },
        },
      ],
      "check:demo",
    );
    expect(proposals[0]?.id).toBe("prevent-no-raw-sql");
    expect(proposals[0]?.verified).toBe(false);
    expect(proposals[0]?.source).toBe("check:demo");
  });

  it("does not propose a guard for a failing guard", () => {
    const proposals = proposeGuards(
      [
        {
          result: {
            name: "guard:prevent-no-raw-sql",
            kind: "grep-absent",
            severity: "error",
            status: "fail",
            detail: "1 match",
            duration_ms: 1,
            guard: "prevent-no-raw-sql",
          },
          definition: {
            name: "guard:prevent-no-raw-sql",
            kind: "grep-absent",
            path: "internal",
            glob: "**/*.go",
            pattern: '\\.Query\\("',
            guard: "prevent-no-raw-sql",
          },
        },
      ],
      "check:demo",
    );
    expect(proposals).toEqual([]);
  });
});
