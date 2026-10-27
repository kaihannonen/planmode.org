import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { runLoop } from "../../src/lib/loop/loop.js";
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

function writeProject(dir: string, command = "node -e \"process.exit(0)\""): void {
  writeFile(
    dir,
    "harness.yaml",
    [
      "name: loop-harness",
      "version: 0.1.0",
      "evals:",
      "  - name: has-timeout",
      "    kind: grep-present",
      "    path: src",
      '    glob: "**/*.ts"',
      "    pattern: 'setTimeout'",
      "  - name: no-console-log",
      "    kind: grep-absent",
      "    path: src",
      '    glob: "**/*.ts"',
      "    pattern: 'console\\.log'",
      "verification:",
      "  commands:",
      "    - name: smoke",
      `      run: '${command}'`,
      "",
    ].join("\n"),
  );
  writeFile(dir, "src/a.ts", "export const wait = () => setTimeout(() => {}, 10);\n");
}

function writeAgent(
  dir: string,
  mode: "fix" | "stuck" | "regress" | "tamper",
): string {
  const file = path.join(dir, "agent.mjs");
  writeFile(
    dir,
    "agent.mjs",
    [
      'import fs from "node:fs";',
      'import path from "node:path";',
      "const workspace = process.env.PLANMODE_WORKSPACE;",
      "const iteration = process.env.PLANMODE_ITERATION;",
      "const failure = process.env.PLANMODE_FAILURE_FILE;",
      'const target = path.join(workspace, "src", "a.ts");',
      `const mode = ${JSON.stringify(mode)};`,
      "const clean = 'export const wait = () => setTimeout(() => {}, 10);\\nexport const built = true;\\n';",
      "const withConsole = 'export const wait = () => setTimeout(() => {}, 10);\\nconsole.log(\"debug\");\\n';",
      "const noTimeout = 'console.log(\"debug\");\\n';",
      "if (mode === 'tamper') {",
      '  fs.writeFileSync(path.join(workspace, "harness.yaml"), "name: tampered\\nevals:\\n  - name: tampered\\n    kind: path-exists\\n    path: src\\n");',
      "} else if (mode === 'stuck') {",
      "  fs.writeFileSync(target, withConsole);",
      "} else if (mode === 'regress' && iteration === '2') {",
      "  fs.writeFileSync(target, noTimeout);",
      "} else if (failure && fs.existsSync(failure)) {",
      "  fs.writeFileSync(target, clean);",
      "} else {",
      "  fs.writeFileSync(target, withConsole);",
      "}",
      "",
    ].join("\n"),
  );
  return file;
}

function commandFor(script: string): string {
  return `"${process.execPath}" "${script}"`;
}

describe("runLoop", () => {
  it("runs a builder, catches a failure, fixes it, and passes", () => {
    const source = useTmpDir();
    const reports = useTmpDir();
    writeProject(source);
    const agent = writeAgent(useTmpDir(), "fix");

    const result = runLoop({
      sourceDir: source,
      harnessPath: path.join(source, "harness.yaml"),
      reportDir: reports,
      agentCommand: commandFor(agent),
      maxIterations: 3,
    });

    expect(result.status).toBe("passed");
    expect(result.iterations).toHaveLength(2);
    expect(result.finalReport?.new_failures).toEqual([]);
    expect(result.iterations[0]?.newFailures).toContain("no-console-log");
    expect(fs.readFileSync(path.join(source, "src/a.ts"), "utf-8")).toContain(
      "setTimeout",
    );
    expect(fs.existsSync(path.join(reports, "LOOP.md"))).toBe(true);
    expect(
      fs.readFileSync(
        path.join(reports, "run-1", "guards.proposed.yaml"),
        "utf-8",
      ),
    ).toContain("prevent-no-console-log");
  });

  it("stops when the same failure repeats", () => {
    const source = useTmpDir();
    writeProject(source);
    const agent = writeAgent(useTmpDir(), "stuck");

    const result = runLoop({
      sourceDir: source,
      harnessPath: path.join(source, "harness.yaml"),
      reportDir: useTmpDir(),
      agentCommand: commandFor(agent),
      maxIterations: 4,
    });

    expect(result.status).toBe("stopped");
    expect(result.reason).toMatch(/No progress/);
    expect(result.iterations.length).toBe(2);
  });

  it("stops on a regression in a previously passing check", () => {
    const source = useTmpDir();
    writeProject(source);
    const agent = writeAgent(useTmpDir(), "regress");

    const result = runLoop({
      sourceDir: source,
      harnessPath: path.join(source, "harness.yaml"),
      reportDir: useTmpDir(),
      agentCommand: commandFor(agent),
      maxIterations: 4,
    });

    expect(result.status).toBe("stopped");
    expect(result.iterations[1]?.regressions).toContain("has-timeout");
    expect(result.reason).toMatch(/Regression/);
  });

  it("is inconclusive when required checks were skipped", () => {
    const source = useTmpDir();
    writeProject(source);

    const result = runLoop({
      sourceDir: source,
      harnessPath: path.join(source, "harness.yaml"),
      reportDir: useTmpDir(),
      agentCommand: `"${process.execPath}" -e "require('fs').appendFileSync(process.env.PLANMODE_WORKSPACE + '/src/a.ts', 'export const built = true;\\n')"`,
      skipCommands: true,
      maxIterations: 1,
    });

    expect(result.status).toBe("inconclusive");
    expect(result.finalReport?.not_verified.join(" ")).toMatch(
      /verification commands were skipped/,
    );
  });

  it("rejects invalid iteration budgets", () => {
    const source = useTmpDir();
    const reports = useTmpDir();
    writeProject(source);
    const agent = writeAgent(useTmpDir(), "fix");

    expect(() =>
      runLoop({
        sourceDir: source,
        harnessPath: path.join(source, "harness.yaml"),
        reportDir: reports,
        agentCommand: commandFor(agent),
        maxIterations: Number.NaN,
      }),
    ).toThrow(/max-iterations/);
    expect(() =>
      runLoop({
        sourceDir: source,
        harnessPath: path.join(source, "harness.yaml"),
        reportDir: reports,
        agentCommand: commandFor(agent),
        agentTimeout: -1,
      }),
    ).toThrow(/agent-timeout/);
  });

  it("runs an independent semantic reviewer after deterministic checks pass", () => {
    const source = useTmpDir();
    const reports = useTmpDir();
    writeProject(source);
    const agent = writeAgent(useTmpDir(), "fix");
    const judgeScript = path.join(useTmpDir(), "judge.mjs");
    writeFile(
      path.dirname(judgeScript),
      "judge.mjs",
      [
        'import fs from "node:fs";',
        "fs.writeFileSync(process.env.PLANMODE_JUDGE_OUTPUT, JSON.stringify({ verdict: 'pass', summary: 'looks good', findings: [] }));",
      ].join("\n"),
    );

    const result = runLoop({
      sourceDir: source,
      harnessPath: path.join(source, "harness.yaml"),
      reportDir: reports,
      agentCommand: commandFor(agent),
      judgeAgent: commandFor(judgeScript),
      maxIterations: 2,
    });

    expect(result.status).toBe("passed");
    expect(result.judge?.semantic?.status).toBe("pass");
    expect(
      fs.existsSync(path.join(reports, "run-2", "SEMANTIC_REVIEW.json")),
    ).toBe(true);
    expect(fs.existsSync(path.join(reports, "run-2", "JUDGE.json"))).toBe(true);
  });

  it("uses a frozen plan contract and records its hash", () => {
    const source = useTmpDir();
    const reports = useTmpDir();
    writeProject(source);
    const plan = path.join(source, "plan.md");
    writeFile(
      source,
      "plan.md",
      [
        "---",
        "contract:",
        "  acceptance:",
        "    - no console logs",
        "  allowed_paths:",
        "    - src/**",
        "---",
        "",
        "Remove console logs and leave the timeout in place.",
        "",
      ].join("\n"),
    );
    const agent = writeAgent(useTmpDir(), "fix");

    const result = runLoop({
      sourceDir: source,
      harnessPath: path.join(source, "harness.yaml"),
      reportDir: reports,
      planPath: plan,
      agentCommand: commandFor(agent),
      maxIterations: 2,
    });

    expect(result.status).toBe("passed");
    expect(result.planHash).toBeTruthy();
    expect(result.contractHash).toBeTruthy();
    expect(result.judge?.contract?.hash).toBe(result.contractHash);
    expect(result.judge?.plan?.hash).toBe(result.planHash);
    expect(fs.existsSync(path.join(reports, "contract.json"))).toBe(true);
    expect(fs.existsSync(path.join(reports, "plan.sha256"))).toBe(true);
  });

  it("stops when the builder edits a protected file", () => {
    const source = useTmpDir();
    const reports = useTmpDir();
    writeProject(source);
    const agent = writeAgent(useTmpDir(), "tamper");

    const result = runLoop({
      sourceDir: source,
      harnessPath: path.join(source, "harness.yaml"),
      reportDir: reports,
      agentCommand: commandFor(agent),
      maxIterations: 2,
    });

    expect(result.status).toBe("stopped");
    expect(result.reason).toMatch(/Protected files changed/);
    expect(result.iterations[0]?.protectedChanges).toContain("harness.yaml");
    expect(
      fs.existsSync(path.join(reports, "run-1", "protected-change.md")),
    ).toBe(true);
  });

  it("can link dependency directories into the copied workspace", () => {
    const source = useTmpDir();
    const reports = useTmpDir();
    writeProject(source);
    writeFile(source, "node_modules/fake/index.js", "module.exports = 1;\n");
    const agent = writeAgent(useTmpDir(), "fix");

    const result = runLoop({
      sourceDir: source,
      harnessPath: path.join(source, "harness.yaml"),
      reportDir: reports,
      agentCommand: commandFor(agent),
      maxIterations: 2,
      linkDependencies: true,
    });

    expect(result.status).toBe("passed");
    const linked = path.join(result.workspace, "node_modules");
    expect(fs.lstatSync(linked).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(linked, "fake", "index.js"))).toBe(true);
  });

  it("never edits the source checkout", () => {
    const source = useTmpDir();
    writeProject(source);
    const agent = writeAgent(useTmpDir(), "fix");

    const result = runLoop({
      sourceDir: source,
      harnessPath: path.join(source, "harness.yaml"),
      reportDir: useTmpDir(),
      agentCommand: commandFor(agent),
      maxIterations: 2,
    });

    expect(result.workspace).not.toBe(source);
    expect(fs.readFileSync(path.join(source, "src/a.ts"), "utf-8")).toBe(
      "export const wait = () => setTimeout(() => {}, 10);\n",
    );
  });
});
