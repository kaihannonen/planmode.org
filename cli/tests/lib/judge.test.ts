import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createTmpDir, writeFile } from "../helpers.js";
import {
  contractHash,
  formatContractForPrompt,
  loadContract,
  normalizeContract,
  parseFrontmatter,
} from "../../src/lib/judge/contract.js";
import { auditDiff } from "../../src/lib/judge/diff.js";
import {
  buildJudgeReport,
  writeJudgeArtifacts,
} from "../../src/lib/judge/judge.js";
import { runSemanticReview } from "../../src/lib/judge/semantic.js";
import type { CheckReport } from "../../src/lib/checks/types.js";
import type { Contract, DiffReport } from "../../src/lib/judge/types.js";

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

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    version: 1,
    acceptance: [],
    allowed_paths: [],
    protected_paths: [],
    allow_test_edits: false,
    allow_dependency_changes: false,
    allow_binary_changes: false,
    max_changed_files: 50,
    max_changed_lines: 2000,
    ...overrides,
  };
}

function checkReport(overrides: Partial<CheckReport> = {}): CheckReport {
  return {
    version: 1,
    harness: "test",
    target: ".",
    mode: "full",
    environment: {},
    started_at: new Date().toISOString(),
    duration_ms: 1,
    score: 100,
    passed: 1,
    failed: 0,
    skipped: 0,
    errors: 0,
    changed_files: [],
    results: [],
    fixed: [],
    flaky: [],
    new_failures: [],
    definition_changes: [],
    not_verified: [],
    suggested_guards: [],
    ...overrides,
  };
}

function diffReport(overrides: Partial<DiffReport> = {}): DiffReport {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    base: "/base",
    target: "/target",
    files: [{ path: "src/a.ts", status: "modified" }],
    summary: {
      added: 0,
      modified: 1,
      deleted: 0,
      changed_files: 1,
      changed_lines: 2,
    },
    findings: [],
    status: "pass",
    ...overrides,
  };
}

function makeProject(): { base: string; target: string } {
  const base = useTmpDir();
  const target = useTmpDir();
  writeFile(base, "src/a.ts", "export const value = 1;\n");
  writeFile(base, "docs/readme.md", "base\n");
  writeFile(base, "tests/a.test.ts", "test('a', () => {});\n");
  writeFile(base, "package.json", "{}\n");
  writeFile(base, ".planmode/guards.yaml", "version: 1\nguards: []\n");
  writeFile(target, "src/a.ts", "export const value = 1;\n");
  writeFile(target, "docs/readme.md", "base\n");
  writeFile(target, "tests/a.test.ts", "test('a', () => {});\n");
  writeFile(target, "package.json", "{}\n");
  writeFile(target, ".planmode/guards.yaml", "version: 1\nguards: []\n");
  return { base, target };
}

describe("contract", () => {
  it("normalizes defaults and hashes stably", () => {
    const first = normalizeContract({
      contract: {
        acceptance: ["works"],
        allowed_paths: "src/**",
        max_changed_files: 3,
      },
    });
    const second = normalizeContract({
      contract: {
        acceptance: ["works"],
        allowed_paths: "src/**",
        max_changed_files: 3,
      },
    });
    expect(first.allowed_paths).toEqual(["src/**"]);
    expect(first.protected_paths).toEqual([]);
    expect(first.allow_test_edits).toBe(false);
    expect(contractHash(first)).toBe(contractHash(second));
    expect(formatContractForPrompt({
      contract: first,
      hash: contractHash(first),
      file: "/plan.md",
      source: "plan-frontmatter",
    })).toContain("src/**");
  });

  it("reads a contract from plan frontmatter and falls back to the project file", () => {
    const dir = useTmpDir();
    const plan = path.join(dir, "plan.md");
    fs.writeFileSync(
      plan,
      [
        "---",
        "contract:",
        "  acceptance:",
        "    - the check passes",
        "  allowed_paths:",
        "    - src/**",
        "---",
        "",
        "# Plan",
        "",
      ].join("\n"),
    );
    const loaded = loadContract({ planPath: plan, projectDir: dir });
    expect(loaded?.source).toBe("plan-frontmatter");
    expect(loaded?.contract.acceptance).toEqual([
      { criterion: "the check passes" },
    ]);

    const project = useTmpDir();
    writeFile(project, ".planmode/contract.yaml", "acceptance:\n  - from file\n");
    const fallback = loadContract({ planPath: plan, projectDir: project });
    // The plan has a contract, so it wins over the project file.
    expect(fallback?.source).toBe("plan-frontmatter");

    const plainPlan = path.join(project, "plain.md");
    fs.writeFileSync(plainPlan, "# Plain plan\n");
    const fileContract = loadContract({ planPath: plainPlan, projectDir: project });
    expect(fileContract?.source).toBe("contract-file");
    expect(fileContract?.contract.acceptance).toEqual([
      { criterion: "from file" },
    ]);
  });

  it("parses frontmatter without a contract and rejects invalid data", () => {
    expect(parseFrontmatter("---\ntitle: x\n---\nbody").data).toEqual({
      title: "x",
    });
    expect(() => normalizeContract({ version: 2 })).toThrow(/version/);
    expect(() =>
      normalizeContract({ max_changed_files: 0 }),
    ).toThrow(/positive integer/);
  });
});

describe("diff audit", () => {
  it("fails a no-op change", () => {
    const { base, target } = makeProject();
    const report = auditDiff({ baseDir: base, targetDir: target });
    expect(report.status).toBe("fail");
    expect(report.findings.some((item) => item.id === "no-change")).toBe(true);
  });

  it("passes a normal source change", () => {
    const { base, target } = makeProject();
    writeFile(target, "src/a.ts", "export const value = 2;\n");
    const report = auditDiff({ baseDir: base, targetDir: target });
    expect(report.status).toBe("pass");
    expect(report.files).toHaveLength(1);
    expect(report.files[0]).toMatchObject({
      path: "src/a.ts",
      status: "modified",
    });
  });

  it("flags protected, test, dependency, and scope changes", () => {
    const { base, target } = makeProject();
    writeFile(target, ".planmode/guards.yaml", "version: 1\nguards: [{}]\n");
    writeFile(target, "tests/a.test.ts", "test('weakened', () => {});\n");
    writeFile(target, "package.json", '{"changed":true}\n');
    writeFile(base, "packages/foo/package.json", "{}\n");
    writeFile(target, "packages/foo/package.json", '{"changed":true}\n');
    writeFile(target, "docs/readme.md", "changed\n");

    const report = auditDiff({
      baseDir: base,
      targetDir: target,
      contract: contract({ allowed_paths: ["src/**"] }),
    });
    expect(report.status).toBe("fail");
    expect(report.findings.map((item) => item.category)).toEqual(
      expect.arrayContaining(["protected", "tests", "dependencies", "scope"]),
    );
  });

  it("detects dependency changes in nested workspace packages", () => {
    const { base, target } = makeProject();
    writeFile(base, "packages/foo/package.json", "{}\n");
    writeFile(target, "packages/foo/package.json", '{"changed":true}\n');
    const report = auditDiff({ baseDir: base, targetDir: target });
    expect(report.status).toBe("fail");
    expect(
      report.findings.some(
        (item) =>
          item.category === "dependencies" &&
          item.file === "packages/foo/package.json",
      ),
    ).toBe(true);
  });

  it("allows test and dependency changes when the contract permits them", () => {
    const { base, target } = makeProject();
    writeFile(target, "src/a.ts", "export const value = 2;\n");
    writeFile(target, "tests/a.test.ts", "test('updated', () => {});\n");
    writeFile(target, "package.json", '{"changed":true}\n');
    const report = auditDiff({
      baseDir: base,
      targetDir: target,
      contract: contract({
        allow_test_edits: true,
        allow_dependency_changes: true,
      }),
    });
    expect(report.status).toBe("pass");
  });

  it("detects a high-confidence secret added by the change", () => {
    const { base, target } = makeProject();
    writeFile(
      target,
      "src/a.ts",
      "export const key = 'AKIA1234567890ABCDEF';\n",
    );
    const report = auditDiff({ baseDir: base, targetDir: target });
    expect(report.status).toBe("fail");
    expect(report.findings.some((item) => item.category === "secret")).toBe(true);
  });

  it("fails on binary changes unless the contract allows them", () => {
    const { base, target } = makeProject();
    writeFile(base, "asset.bin", "old");
    fs.writeFileSync(path.join(target, "asset.bin"), Buffer.from([0, 1, 2, 3]));
    const blocked = auditDiff({ baseDir: base, targetDir: target });
    expect(blocked.status).toBe("fail");
    expect(blocked.findings.some((item) => item.category === "binary")).toBe(
      true,
    );
    const allowed = auditDiff({
      baseDir: base,
      targetDir: target,
      contract: contract({ allow_binary_changes: true }),
    });
    expect(allowed.status).toBe("pass");
  });

  it("fails on a hard-coded unimplemented stub but only warns on TODO", () => {
    const { base, target } = makeProject();
    writeFile(target, "src/a.ts", 'throw new Error("not implemented");\n');
    const hard = auditDiff({ baseDir: base, targetDir: target });
    expect(hard.status).toBe("fail");
    expect(
      hard.findings.some(
        (item) => item.category === "quality" && item.severity === "error",
      ),
    ).toBe(true);

    writeFile(target, "src/a.ts", "// TODO: improve this\\nexport const value = 2;\\n");
    const todo = auditDiff({ baseDir: base, targetDir: target });
    expect(todo.status).toBe("pass");
    expect(
      todo.findings.some(
        (item) => item.category === "quality" && item.severity === "warn",
      ),
    ).toBe(true);
  });

  it("enforces file and line budgets", () => {
    const { base, target } = makeProject();
    writeFile(target, "src/a.ts", "export const value = 2;\n");
    writeFile(target, "docs/readme.md", "changed\n");
    const report = auditDiff({
      baseDir: base,
      targetDir: target,
      contract: contract({ max_changed_files: 1, max_changed_lines: 1 }),
    });
    expect(report.status).toBe("fail");
    expect(report.findings.some((item) => item.id === "too-many-files")).toBe(
      true,
    );
    expect(report.findings.some((item) => item.id === "too-many-lines")).toBe(
      true,
    );
  });
});

describe("judge report", () => {
  it("passes only when checks, diff, and semantic review pass", () => {
    const pass = buildJudgeReport({
      check: checkReport(),
      diff: diffReport(),
    });
    expect(pass.status).toBe("pass");

    const failure = buildJudgeReport({
      check: checkReport({ new_failures: ["no-console-log"] }),
      diff: diffReport(),
    });
    expect(failure.status).toBe("fail");

    const diffFailure = buildJudgeReport({
      check: checkReport(),
      diff: diffReport({ status: "fail" }),
    });
    expect(diffFailure.status).toBe("fail");

    const skipped = buildJudgeReport({
      check: checkReport({ not_verified: ["smoke: skipped"] }),
      diff: diffReport(),
    });
    expect(skipped.status).toBe("inconclusive");

    const semanticFailure = buildJudgeReport({
      check: checkReport(),
      diff: diffReport(),
      semantic: {
        status: "fail",
        summary: "does not satisfy the contract",
        findings: [{ severity: "error", message: "missing behavior" }],
        command: "reviewer",
        duration_ms: 1,
        output_file: "/tmp/out.json",
      },
    });
    expect(semanticFailure.status).toBe("needs_human");
    expect(semanticFailure.findings.some((item) => item.category === "judge")).toBe(
      true,
    );

    const inconsistentPass = buildJudgeReport({
      check: checkReport(),
      diff: diffReport(),
      semantic: {
        status: "pass",
        summary: "pass, but with an error",
        findings: [{ severity: "error", message: "contradiction" }],
        command: "reviewer",
        duration_ms: 1,
        output_file: "/tmp/out.json",
      },
    });
    expect(inconsistentPass.status).toBe("needs_human");
  });

  it("gates contract criteria that are mapped to checks", () => {
    const contractWithCheck = {
      contract: contract({
        acceptance: [{ criterion: "smoke passes", check: "command:smoke" }],
      }),
      hash: "contract-hash",
      source: "plan-frontmatter" as const,
    };
    const passing = buildJudgeReport({
      check: checkReport({
        results: [
          {
            name: "command:smoke",
            kind: "command",
            severity: "error",
            status: "pass",
            detail: "ok",
            duration_ms: 1,
          },
        ],
      }),
      diff: diffReport(),
      contract: contractWithCheck,
    });
    expect(passing.status).toBe("pass");
    expect(passing.acceptance[0]?.status).toBe("pass");

    const missing = buildJudgeReport({
      check: checkReport(),
      diff: diffReport(),
      contract: contractWithCheck,
    });
    expect(missing.status).toBe("fail");
    expect(missing.reason).toContain("smoke passes");
    expect(missing.acceptance[0]?.status).toBe("missing");
  });

  it("writes JSON and Markdown artifacts", () => {
    const dir = useTmpDir();
    const report = buildJudgeReport({
      check: checkReport(),
      diff: diffReport(),
    });
    writeJudgeArtifacts(report, dir);
    expect(fs.existsSync(path.join(dir, "JUDGE.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "JUDGE.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "DIFF_AUDIT.json"))).toBe(true);
  });
});

describe("semantic reviewer", () => {
  function reviewer(
    dir: string,
    body: string,
  ): string {
    const file = path.join(dir, "reviewer.mjs");
    writeFile(dir, "reviewer.mjs", body);
    return `"${process.execPath}" "${file}"`;
  }

  it("accepts a valid reviewer result without editing the workspace", () => {
    const workspace = useTmpDir();
    writeFile(workspace, "src/a.ts", "export const value = 1;\n");
    const artifacts = useTmpDir();
    const outputFile = path.join(artifacts, "semantic-agent.json");
    const command = reviewer(
      artifacts,
      [
        'import fs from "node:fs";',
        "fs.writeFileSync(process.env.PLANMODE_JUDGE_OUTPUT, JSON.stringify({ verdict: 'pass', summary: 'looks good', findings: [] }));",
      ].join("\n"),
    );
    const result = runSemanticReview({
      command,
      workspace,
      prompt: "review",
      outputFile,
    });
    expect(result.status).toBe("pass");
    expect(result.summary).toBe("looks good");
    expect(fs.readFileSync(path.join(workspace, "src/a.ts"), "utf-8")).toContain(
      "value",
    );
  });

  it("requires a human when the reviewer edits the workspace", () => {
    const workspace = useTmpDir();
    writeFile(workspace, "src/a.ts", "export const value = 1;\n");
    const artifacts = useTmpDir();
    const outputFile = path.join(artifacts, "semantic-agent.json");
    const command = reviewer(
      artifacts,
      [
        'import fs from "node:fs";',
        "fs.appendFileSync('src/a.ts', '// reviewer edit\\n');",
        "fs.writeFileSync(process.env.PLANMODE_JUDGE_OUTPUT, JSON.stringify({ verdict: 'pass', summary: 'ok', findings: [] }));",
      ].join("\n"),
    );
    const result = runSemanticReview({
      command,
      workspace,
      prompt: "review",
      outputFile,
    });
    expect(result.status).toBe("needs_human");
    expect(result.summary).toContain("modified the workspace");
  });

  it("is inconclusive when the reviewer writes invalid output", () => {
    const workspace = useTmpDir();
    const artifacts = useTmpDir();
    const outputFile = path.join(artifacts, "semantic-agent.json");
    const command = reviewer(
      artifacts,
      'import fs from "node:fs"; fs.writeFileSync(process.env.PLANMODE_JUDGE_OUTPUT, "not json");',
    );
    const result = runSemanticReview({
      command,
      workspace,
      prompt: "review",
      outputFile,
    });
    expect(result.status).toBe("inconclusive");
  });
});
