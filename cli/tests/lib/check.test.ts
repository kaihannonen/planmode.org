import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { checkShouldFail, runCheck } from "../../src/lib/checks/run.js";
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

function writeHarness(dir: string, command = "node -e \"process.exit(0)\""): void {
  writeFile(
    dir,
    "harness.yaml",
    [
      "name: test-harness",
      "version: 0.1.0",
      "evals:",
      "  - name: app-directory",
      "    kind: path-exists",
      "    path: app",
      "  - name: has-timeout",
      "    kind: grep-present",
      "    path: src",
      '    glob: "**/*.ts"',
      "    pattern: 'setTimeout'",
      "    min: 1",
      "  - name: no-console-log",
      "    kind: grep-absent",
      "    path: src",
      '    glob: "**/*.ts"',
      "    pattern: 'console\\.log'",
      "    severity: error",
      "verification:",
      "  commands:",
      "    - name: smoke",
      `      run: '${command}'`,
      "",
    ].join("\n"),
  );
}

function writeCleanProject(dir: string): void {
  writeFile(dir, "app/page.ts", "export default function Page() { return null; }\n");
  writeFile(dir, "src/a.ts", "export const wait = () => setTimeout(() => {}, 10);\n");
}

describe("runCheck", () => {
  it("passes against a clean project without git", () => {
    const dir = useTmpDir();
    writeHarness(dir);
    writeCleanProject(dir);

    const report = runCheck({ targetDir: dir });
    expect(report.mode).toBe("full");
    expect(report.score).toBe(100);
    expect(report.failed).toBe(0);
    expect(fs.existsSync(path.join(dir, ".git"))).toBe(false);
  });

  it("fails and suggests a deterministic guard", () => {
    const dir = useTmpDir();
    writeHarness(dir);
    writeCleanProject(dir);
    writeFile(dir, "src/bad.ts", "console.log('debug');\n");

    const report = runCheck({ targetDir: dir });
    expect(report.failed).toBe(1);
    expect(report.score).toBeLessThan(100);
    expect(report.new_failures).toContain("no-console-log");
    expect(report.suggested_guards.map((guard) => guard.id)).toContain(
      "prevent-no-console-log",
    );
  });

  it("runs command checks and reports missing commands as skipped", () => {
    const dir = useTmpDir();
    writeHarness(dir);
    writeCleanProject(dir);

    const pass = runCheck({ targetDir: dir });
    expect(pass.results.find((result) => result.name === "command:smoke")?.status).toBe(
      "pass",
    );

    const skipped = runCheck({ targetDir: dir, skipCommands: true });
    expect(skipped.not_verified).toContain(
      "verification commands were skipped (--skip-commands)",
    );
  });

  it("reruns a failed command once and records flakiness", () => {
    const dir = useTmpDir();
    writeHarness(dir, `"${process.execPath}" "flaky.mjs"`);
    writeCleanProject(dir);
    writeFile(
      dir,
      "flaky.mjs",
      [
        'import fs from "node:fs";',
        'if (!fs.existsSync("flaky.count")) {',
        '  fs.writeFileSync("flaky.count", "1");',
        "  process.exit(1);",
        "}",
        "process.exit(0);",
        "",
      ].join("\n"),
    );

    const withoutRerun = runCheck({ targetDir: dir });
    expect(withoutRerun.failed).toBe(1);

    fs.rmSync(path.join(dir, "flaky.count"), { force: true });
    const report = runCheck({ targetDir: dir, rerunFailures: true });
    expect(report.failed).toBe(0);
    expect(report.flaky).toContain("command:smoke");
    const smoke = report.results.find((result) => result.name === "command:smoke");
    expect(smoke?.attempts).toBe(2);
    expect(smoke?.first_attempt_status).toBe("fail");
  });

  it("fails a command with a non-zero exit", () => {
    const dir = useTmpDir();
    writeHarness(dir, "node -e \"process.exit(3)\"");
    writeCleanProject(dir);

    const report = runCheck({ targetDir: dir });
    const command = report.results.find((result) => result.name === "command:smoke");
    expect(command?.status).toBe("fail");
    expect(command?.detail).toContain("exit 3");
  });

  it("uses a base directory to ignore pre-existing violations", () => {
    const base = useTmpDir();
    const target = useTmpDir();
    writeHarness(target);
    writeCleanProject(target);
    writeFile(base, "src/legacy.ts", "console.log('old');\n");
    writeFile(target, "src/legacy.ts", "console.log('old');\n");
    writeFile(target, "src/new.ts", "export const ok = true;\n");

    const full = runCheck({ targetDir: target });
    expect(full.failed).toBe(1);

    const changed = runCheck({
      targetDir: target,
      baseDir: base,
      changedOnly: true,
    });
    expect(changed.mode).toBe("changed");
    expect(changed.changed_files).toContain("src/new.ts");
    expect(changed.failed).toBe(0);
  });

  it("reports a new violation in a changed file", () => {
    const base = useTmpDir();
    const target = useTmpDir();
    writeHarness(target);
    writeCleanProject(target);
    writeFile(base, "src/a.ts", "export const wait = () => setTimeout(() => {}, 10);\n");
    writeFile(
      target,
      "src/a.ts",
      "export const wait = () => setTimeout(() => {}, 10);\nconsole.log('new');\n",
    );

    const changed = runCheck({
      targetDir: target,
      baseDir: base,
      changedOnly: true,
    });
    expect(changed.failed).toBe(1);
    expect(
      changed.results.find((result) => result.name === "no-console-log")?.status,
    ).toBe("fail");
  });

  it("saves and reads a baseline without git", () => {
    const dir = useTmpDir();
    writeHarness(dir);
    writeCleanProject(dir);
    const baseline = path.join(dir, "baseline.json");

    const first = runCheck({ targetDir: dir, saveBaselinePath: baseline });
    expect(first.failed).toBe(0);
    expect(fs.existsSync(baseline)).toBe(true);

    writeFile(dir, "src/new.ts", "console.log('later');\n");
    const second = runCheck({ targetDir: dir, baselinePath: baseline });
    expect(second.mode).toBe("changed");
    expect(second.new_failures).toContain("no-console-log");
  });

  it("treats a changed check definition as a new failure, not pre-existing", () => {
    const dir = useTmpDir();
    const harness = [
      "name: changed-check",
      "evals:",
      "  - name: no-console-log",
      "    kind: grep-absent",
      "    path: src",
      '    glob: "**/*.ts"',
      "    pattern: 'console\\.log'",
      "",
    ].join("\n");
    writeFile(dir, "harness.yaml", harness);
    writeFile(dir, "src/a.ts", "console.log('legacy');\n");
    const baseline = path.join(dir, "baseline.json");

    const first = runCheck({ targetDir: dir, saveBaselinePath: baseline });
    expect(first.failed).toBe(1);

    // The check still fails, but its definition was weakened. The baseline
    // status must not hide that change.
    writeFile(
      dir,
      "harness.yaml",
      harness.replace("pattern: 'console\\.log'", "pattern: 'console'"),
    );
    const second = runCheck({ targetDir: dir, baselinePath: baseline });
    expect(second.definition_changes).toContain("no-console-log");
    expect(second.new_failures).toContain("no-console-log");
  });

  it("writes a proof bundle", () => {
    const dir = useTmpDir();
    const reports = useTmpDir();
    writeHarness(dir);
    writeCleanProject(dir);
    writeFile(dir, "src/bad.ts", "console.log('debug');\n");

    runCheck({ targetDir: dir, reportDir: reports });
    expect(fs.existsSync(path.join(reports, "report.json"))).toBe(true);
    expect(fs.existsSync(path.join(reports, "PROOF.md"))).toBe(true);
    expect(fs.existsSync(path.join(reports, "guards.proposed.yaml"))).toBe(true);

    const proof = fs.readFileSync(path.join(reports, "PROOF.md"), "utf-8");
    expect(proof).toContain("## Not verified");
    expect(proof).toContain("## Suggested guards");
  });

  it("rejects duplicate check names", () => {
    const dir = useTmpDir();
    writeFile(
      dir,
      "harness.yaml",
      [
        "name: duplicate-harness",
        "evals:",
        "  - name: app-directory",
        "    kind: path-exists",
        "    path: app",
        "  - name: app-directory",
        "    kind: path-exists",
        "    path: src",
        "",
      ].join("\n"),
    );
    writeCleanProject(dir);
    expect(() => runCheck({ targetDir: dir })).toThrow(/Duplicate check names/);
  });

  it("fails closed when required checks were skipped", () => {
    const dir = useTmpDir();
    writeHarness(dir);
    writeCleanProject(dir);

    const report = runCheck({ targetDir: dir, skipCommands: true });
    expect(report.not_verified.length).toBeGreaterThan(0);
    expect(checkShouldFail(report, "error", false)).toBe(true);
    expect(checkShouldFail(report, "error", true)).toBe(false);
    expect(checkShouldFail(report, "never", false)).toBe(false);
  });

  it("suggests guards only for new failures, not pre-existing ones", () => {
    const dir = useTmpDir();
    writeFile(
      dir,
      "harness.yaml",
      [
        "name: delta-harness",
        "evals:",
        "  - name: legacy-missing",
        "    kind: path-exists",
        "    path: legacy",
        "  - name: no-console-log",
        "    kind: grep-absent",
        "    path: src",
        '    glob: "**/*.ts"',
        "    pattern: 'console\\.log'",
        "",
      ].join("\n"),
    );
    writeFile(dir, "src/a.ts", "export const ok = true;\n");
    const baseline = path.join(dir, "baseline.json");
    runCheck({ targetDir: dir, saveBaselinePath: baseline });

    writeFile(dir, "src/b.ts", "console.log('new');\n");
    const report = runCheck({ targetDir: dir, baselinePath: baseline });
    expect(report.suggested_guards.map((guard) => guard.id)).toEqual([
      "prevent-no-console-log",
    ]);
  });

  it("rejects a grep-present check with a vacuous min", () => {
    const dir = useTmpDir();
    writeFile(
      dir,
      "harness.yaml",
      [
        "name: bad-min",
        "evals:",
        "  - name: has-console",
        "    kind: grep-present",
        "    path: src",
        '    glob: "**/*.ts"',
        "    pattern: 'console'",
        "    min: 0",
        "",
      ].join("\n"),
    );
    writeFile(dir, "src/a.ts", "console.log('present');\n");

    const report = runCheck({ targetDir: dir });
    const result = report.results.find((item) => item.name === "has-console");
    expect(result?.status).toBe("error");
    expect(result?.detail).toContain("min must be a positive integer");
  });

  it("fails when a grep glob matches no files", () => {
    const dir = useTmpDir();
    writeFile(
      dir,
      "harness.yaml",
      [
        "name: empty-glob",
        "evals:",
        "  - name: no-python-print",
        "    kind: grep-absent",
        "    path: src",
        '    glob: "**/*.py"',
        "    pattern: 'print\\('",
        "",
      ].join("\n"),
    );
    writeCleanProject(dir);

    const report = runCheck({ targetDir: dir });
    const result = report.results.find(
      (item) => item.name === "no-python-print",
    );
    expect(result?.status).toBe("fail");
    expect(result?.detail).toContain("no files matched");
  });

  it("requires a harness", () => {
    const dir = useTmpDir();
    expect(() => runCheck({ targetDir: dir })).toThrow(
      /No harness or guards found/,
    );
  });
});
