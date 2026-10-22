import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  applyTargets,
  checkTargets,
  parseTargets,
  removeTargets,
  resolveTargets,
} from "../../src/lib/targets.js";
import { createTmpDir, writeFile } from "../helpers.js";

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

function read(dir: string, file: string): string {
  return fs.readFileSync(path.join(dir, file), "utf-8");
}

describe("parseTargets", () => {
  it("defaults to claude", () => {
    expect(parseTargets(undefined)).toEqual(["claude"]);
  });

  it("parses comma-separated targets", () => {
    expect(parseTargets("claude,codex")).toEqual(["claude", "codex"]);
  });

  it("deduplicates targets", () => {
    expect(parseTargets("codex,codex,cursor")).toEqual(["codex", "cursor"]);
  });

  it("expands all", () => {
    expect(parseTargets("all")).toEqual(["claude", "codex", "cursor"]);
  });

  it("rejects unknown targets", () => {
    expect(() => parseTargets("vim")).toThrow("Unknown target");
    expect(() => parseTargets("all,vim")).toThrow("Unknown target");
  });
});

describe("resolveTargets", () => {
  it("uses planmode.config.yaml when no CLI target is provided", () => {
    const dir = useTmpDir();
    writeFile(dir, "planmode.config.yaml", "targets:\n  - codex\n  - cursor\n");
    expect(resolveTargets(undefined, dir)).toEqual(["codex", "cursor"]);
  });

  it("lets the CLI target override project config", () => {
    const dir = useTmpDir();
    writeFile(dir, "planmode.config.yaml", "targets:\n  - codex\n");
    expect(resolveTargets("claude", dir)).toEqual(["claude"]);
  });
});

describe("applyTargets — claude", () => {
  it("adds and removes plan imports in CLAUDE.md", () => {
    const dir = useTmpDir();
    applyTargets({
      targets: ["claude"],
      name: "my-plan",
      type: "plan",
      content: "# Plan",
      projectDir: dir,
    });
    expect(read(dir, "CLAUDE.md")).toContain("- @plans/my-plan.md");

    removeTargets({ targets: ["claude"], name: "my-plan", type: "plan", projectDir: dir });
    expect(read(dir, "CLAUDE.md")).not.toContain("- @plans/my-plan.md");
  });
});

describe("applyTargets — codex", () => {
  it("writes a rule section to AGENTS.md", () => {
    const dir = useTmpDir();
    applyTargets({
      targets: ["codex"],
      name: "my-rule",
      type: "rule",
      content: "# My Rule\n\nUse strict mode.",
      projectDir: dir,
    });

    const agents = read(dir, "AGENTS.md");
    expect(agents).toContain("<!-- planmode:start:my-rule -->");
    expect(agents).toContain("## Rule: my-rule");
    expect(agents).toContain("Use strict mode.");
    expect(agents).toContain("<!-- planmode:end:my-rule -->");
  });

  it("replaces an existing section without duplicating it", () => {
    const dir = useTmpDir();
    applyTargets({
      targets: ["codex"],
      name: "my-rule",
      type: "rule",
      content: "old content",
      projectDir: dir,
    });
    applyTargets({
      targets: ["codex"],
      name: "my-rule",
      type: "rule",
      content: "new content",
      projectDir: dir,
    });

    const agents = read(dir, "AGENTS.md");
    expect(agents).toContain("new content");
    expect(agents).not.toContain("old content");
    expect(agents.match(/planmode:start:my-rule/g)).toHaveLength(1);
  });

  it("adds a plan reference to AGENTS.md", () => {
    const dir = useTmpDir();
    applyTargets({
      targets: ["codex"],
      name: "my-plan",
      type: "plan",
      content: "# Plan",
      description: "Add authentication",
      projectDir: dir,
    });

    const agents = read(dir, "AGENTS.md");
    expect(agents).toContain("## Plan: my-plan");
    expect(agents).toContain("`plans/my-plan.md`");
    expect(agents).toContain("Add authentication");
  });

  it("removes a section from AGENTS.md", () => {
    const dir = useTmpDir();
    applyTargets({
      targets: ["codex"],
      name: "my-rule",
      type: "rule",
      content: "content",
      projectDir: dir,
    });
    removeTargets({ targets: ["codex"], name: "my-rule", type: "rule", projectDir: dir });
    expect(read(dir, "AGENTS.md")).not.toContain("planmode:start:my-rule");
  });
});

describe("applyTargets — cursor", () => {
  it("writes an always-on rule with frontmatter", () => {
    const dir = useTmpDir();
    applyTargets({
      targets: ["cursor"],
      name: "my-rule",
      type: "rule",
      content: "# My Rule\n\nUse strict mode.",
      description: "TypeScript rules",
      projectDir: dir,
    });

    const rule = read(dir, ".cursor/rules/my-rule.mdc");
    expect(rule).toContain("description: TypeScript rules");
    expect(rule).toContain("alwaysApply: true");
    expect(rule).toContain("Use strict mode.");
  });

  it("writes a plan as an agent-requested rule", () => {
    const dir = useTmpDir();
    applyTargets({
      targets: ["cursor"],
      name: "my-plan",
      type: "plan",
      content: "# Plan",
      description: "Add authentication",
      projectDir: dir,
    });

    const rule = read(dir, ".cursor/rules/my-plan.mdc");
    expect(rule).toContain('description: "Plan: Add authentication"');
    expect(rule).toContain("alwaysApply: false");
  });

  it("removes the cursor rule file", () => {
    const dir = useTmpDir();
    applyTargets({
      targets: ["cursor"],
      name: "my-rule",
      type: "rule",
      content: "content",
      projectDir: dir,
    });
    removeTargets({ targets: ["cursor"], name: "my-rule", type: "rule", projectDir: dir });
    expect(fs.existsSync(path.join(dir, ".cursor/rules/my-rule.mdc"))).toBe(false);
  });
});

describe("checkTargets", () => {
  it("reports missing target files", () => {
    const dir = useTmpDir();
    const issues = checkTargets({
      targets: ["codex", "cursor"],
      name: "my-plan",
      type: "plan",
      projectDir: dir,
    });
    expect(issues).toHaveLength(2);
  });

  it("reports no issues after applying targets", () => {
    const dir = useTmpDir();
    applyTargets({
      targets: ["codex", "cursor"],
      name: "my-plan",
      type: "plan",
      content: "# Plan",
      projectDir: dir,
    });
    const issues = checkTargets({
      targets: ["codex", "cursor"],
      name: "my-plan",
      type: "plan",
      projectDir: dir,
    });
    expect(issues).toHaveLength(0);
  });

  it("ignores prompt packages", () => {
    const dir = useTmpDir();
    const issues = checkTargets({
      targets: ["codex", "cursor"],
      name: "my-prompt",
      type: "prompt",
      projectDir: dir,
    });
    expect(issues).toHaveLength(0);
  });
});
