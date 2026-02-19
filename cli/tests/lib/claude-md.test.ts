import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { addImport, removeImport, listImports } from "../../src/lib/claude-md.js";
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

function readClaudeMd(dir: string): string {
  return fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf-8");
}

// ── addImport ──

describe("addImport", () => {
  it("creates CLAUDE.md if missing", () => {
    const dir = useTmpDir();
    addImport("my-plan", dir);
    const content = readClaudeMd(dir);
    expect(content).toContain("# Planmode");
    expect(content).toContain("- @plans/my-plan.md");
  });

  it("appends to existing Planmode section", () => {
    const dir = useTmpDir();
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/existing.md\n");
    addImport("new-plan", dir);
    const content = readClaudeMd(dir);
    expect(content).toContain("- @plans/existing.md");
    expect(content).toContain("- @plans/new-plan.md");
  });

  it("creates Planmode section if missing from existing file", () => {
    const dir = useTmpDir();
    writeFile(dir, "CLAUDE.md", "# My Project\n\nSome content\n");
    addImport("my-plan", dir);
    const content = readClaudeMd(dir);
    expect(content).toContain("# My Project");
    expect(content).toContain("# Planmode");
    expect(content).toContain("- @plans/my-plan.md");
  });

  it("does not add duplicate imports", () => {
    const dir = useTmpDir();
    addImport("my-plan", dir);
    addImport("my-plan", dir);
    const content = readClaudeMd(dir);
    const matches = content.match(/- @plans\/my-plan\.md/g);
    expect(matches).toHaveLength(1);
  });

  it("handles file without trailing newline", () => {
    const dir = useTmpDir();
    writeFile(dir, "CLAUDE.md", "# My Project\n\nContent without trailing newline");
    addImport("my-plan", dir);
    const content = readClaudeMd(dir);
    expect(content).toContain("# Planmode");
    expect(content).toContain("- @plans/my-plan.md");
  });

  it("handles file with trailing newline", () => {
    const dir = useTmpDir();
    writeFile(dir, "CLAUDE.md", "# My Project\n\nContent with trailing newline\n");
    addImport("my-plan", dir);
    const content = readClaudeMd(dir);
    expect(content).toContain("# Planmode");
    expect(content).toContain("- @plans/my-plan.md");
  });
});

// ── removeImport ──

describe("removeImport", () => {
  it("removes an import line", () => {
    const dir = useTmpDir();
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/my-plan.md\n- @plans/other.md\n");
    removeImport("my-plan", dir);
    const content = readClaudeMd(dir);
    expect(content).not.toContain("- @plans/my-plan.md");
    expect(content).toContain("- @plans/other.md");
  });

  it("is a no-op when import does not exist", () => {
    const dir = useTmpDir();
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/other.md\n");
    removeImport("missing-plan", dir);
    const content = readClaudeMd(dir);
    expect(content).toContain("- @plans/other.md");
  });

  it("is a no-op when CLAUDE.md does not exist", () => {
    const dir = useTmpDir();
    // Should not throw
    removeImport("my-plan", dir);
    expect(fs.existsSync(path.join(dir, "CLAUDE.md"))).toBe(false);
  });

  it("preserves other imports", () => {
    const dir = useTmpDir();
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/a.md\n- @plans/b.md\n- @plans/c.md\n");
    removeImport("b", dir);
    const content = readClaudeMd(dir);
    expect(content).toContain("- @plans/a.md");
    expect(content).not.toContain("- @plans/b.md");
    expect(content).toContain("- @plans/c.md");
  });
});

// ── listImports ──

describe("listImports", () => {
  it("returns empty when no CLAUDE.md", () => {
    const dir = useTmpDir();
    expect(listImports(dir)).toEqual([]);
  });

  it("returns empty when CLAUDE.md has no imports", () => {
    const dir = useTmpDir();
    writeFile(dir, "CLAUDE.md", "# My Project\n\nJust some content\n");
    expect(listImports(dir)).toEqual([]);
  });

  it("extracts plan names from imports", () => {
    const dir = useTmpDir();
    writeFile(dir, "CLAUDE.md", "# Planmode\n- @plans/alpha.md\n- @plans/beta.md\n");
    const imports = listImports(dir);
    expect(imports).toEqual(["alpha", "beta"]);
  });

  it("ignores non-import lines", () => {
    const dir = useTmpDir();
    writeFile(
      dir,
      "CLAUDE.md",
      "# Planmode\n- @plans/valid.md\n- some other line\n# Other section\n",
    );
    const imports = listImports(dir);
    expect(imports).toEqual(["valid"]);
  });
});
