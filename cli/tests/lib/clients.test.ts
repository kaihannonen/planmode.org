import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  applyTargets,
  checkTargets,
  detectClients,
  parseTargets,
  readProjectConfig,
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
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

describe("parseTargets", () => {
  it("parses comma-separated and repeated values", () => {
    expect(parseTargets(["claude,codex", "opencode"])).toEqual([
      "claude",
      "codex",
      "opencode",
    ]);
  });

  it("expands all", () => {
    expect(parseTargets("all")).toEqual([
      "claude",
      "codex",
      "cursor",
      "opencode",
    ]);
  });

  it("rejects unknown targets", () => {
    expect(() => parseTargets("windsurf")).toThrow(/Unknown target/);
  });

  it("deduplicates", () => {
    expect(parseTargets(["claude", "claude"])).toEqual(["claude"]);
  });
});

describe("project config", () => {
  it("reads targets from planmode.config.yaml", () => {
    const dir = useTmpDir();
    writeFile(dir, "planmode.config.yaml", "targets: [codex, opencode]\n");
    expect(readProjectConfig(dir).targets).toEqual(["codex", "opencode"]);
    expect(resolveTargets(undefined, dir)).toEqual(["codex", "opencode"]);
  });

  it("defaults to claude", () => {
    const dir = useTmpDir();
    expect(resolveTargets(undefined, dir)).toEqual(["claude"]);
  });
});

describe("client adapters", () => {
  it("renders the same plan for every client", () => {
    const dir = useTmpDir();
    const targets = parseTargets("all");
    writeFile(dir, "plans/add-pagination.md", "# Add pagination\n\nUse a cursor.\n");
    applyTargets({
      targets,
      name: "add-pagination",
      type: "plan",
      content: "# Add pagination\n\nUse a cursor.",
      description: "Add cursor pagination",
      projectDir: dir,
    });

    expect(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf-8")).toContain(
      "- @plans/add-pagination.md",
    );
    expect(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf-8")).toContain(
      "## Plan: add-pagination",
    );
    expect(
      fs.readFileSync(
        path.join(dir, ".cursor/rules/add-pagination.mdc"),
        "utf-8",
      ),
    ).toContain("Plan: Add cursor pagination");
    expect(checkTargets({ targets, name: "add-pagination", type: "plan", projectDir: dir })).toEqual([]);
  });

  it("renders rules for codex, cursor and opencode", () => {
    const dir = useTmpDir();
    writeFile(dir, ".claude/rules/no-any.md", "# no any\n");
    const targets = parseTargets("claude,codex,cursor,opencode");
    applyTargets({
      targets,
      name: "no-any",
      type: "rule",
      content: "Never use `any`.",
      projectDir: dir,
    });

    expect(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf-8")).toContain(
      "## Rule: no-any",
    );
    expect(
      fs.readFileSync(path.join(dir, ".cursor/rules/no-any.mdc"), "utf-8"),
    ).toContain("alwaysApply: true");
    expect(checkTargets({ targets, name: "no-any", type: "rule", projectDir: dir })).toEqual([]);
  });

  it("removes client references", () => {
    const dir = useTmpDir();
    const targets = parseTargets("all");
    applyTargets({
      targets,
      name: "cleanup",
      type: "plan",
      content: "# Cleanup",
      projectDir: dir,
    });
    removeTargets({ targets, name: "cleanup", type: "plan", projectDir: dir });

    expect(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf-8")).not.toContain(
      "cleanup",
    );
    expect(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf-8")).not.toContain(
      "cleanup",
    );
    expect(fs.existsSync(path.join(dir, ".cursor/rules/cleanup.mdc"))).toBe(
      false,
    );
  });

  it("detects configured clients", () => {
    const dir = useTmpDir();
    writeFile(dir, "AGENTS.md", "# Planmode\n");
    writeFile(dir, ".cursor/rules/x.mdc", "---\nalwaysApply: true\n---\n");
    const detected = detectClients(dir).map((client) => client.id);
    expect(detected).toEqual(["codex", "cursor", "opencode"]);
  });
});
