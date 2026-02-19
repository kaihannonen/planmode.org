import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { createPackage } from "../../src/lib/init.js";
import { createTmpDir } from "../helpers.js";

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

describe("createPackage", () => {
  it("creates planmode.yaml with correct fields", () => {
    const dir = useTmpDir();
    createPackage({
      name: "my-plan",
      type: "plan",
      description: "A test plan",
      author: "testuser",
      projectDir: dir,
    });
    const raw = fs.readFileSync(path.join(dir, "planmode.yaml"), "utf-8");
    const manifest = parse(raw);
    expect(manifest.name).toBe("my-plan");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.type).toBe("plan");
    expect(manifest.description).toBe("A test plan");
    expect(manifest.author).toBe("testuser");
    expect(manifest.license).toBe("MIT");
    expect(manifest.content_file).toBe("plan.md");
  });

  it("creates plan.md stub for plan type", () => {
    const dir = useTmpDir();
    createPackage({
      name: "my-plan",
      type: "plan",
      description: "A test plan",
      author: "testuser",
      projectDir: dir,
    });
    const content = fs.readFileSync(path.join(dir, "plan.md"), "utf-8");
    expect(content).toContain("# my-plan");
    expect(content).toContain("Steps");
  });

  it("creates rule.md stub for rule type", () => {
    const dir = useTmpDir();
    createPackage({
      name: "my-rule",
      type: "rule",
      description: "A test rule",
      author: "testuser",
      projectDir: dir,
    });
    expect(fs.existsSync(path.join(dir, "rule.md"))).toBe(true);
    const content = fs.readFileSync(path.join(dir, "rule.md"), "utf-8");
    expect(content).toContain("# my-rule");
    expect(content).toContain("Best Practices");
  });

  it("creates prompt.md stub for prompt type", () => {
    const dir = useTmpDir();
    createPackage({
      name: "my-prompt",
      type: "prompt",
      description: "A test prompt",
      author: "testuser",
      projectDir: dir,
    });
    expect(fs.existsSync(path.join(dir, "prompt.md"))).toBe(true);
    const content = fs.readFileSync(path.join(dir, "prompt.md"), "utf-8");
    expect(content).toContain("# my-prompt");
    expect(content).toContain("Requirements");
  });

  it("includes tags in the manifest", () => {
    const dir = useTmpDir();
    createPackage({
      name: "tagged",
      type: "plan",
      description: "Tagged package",
      author: "testuser",
      tags: ["frontend", "react"],
      projectDir: dir,
    });
    const raw = fs.readFileSync(path.join(dir, "planmode.yaml"), "utf-8");
    const manifest = parse(raw);
    expect(manifest.tags).toEqual(["frontend", "react"]);
  });

  it("uses specified category", () => {
    const dir = useTmpDir();
    createPackage({
      name: "categorized",
      type: "plan",
      description: "Categorized package",
      author: "testuser",
      category: "backend",
      projectDir: dir,
    });
    const raw = fs.readFileSync(path.join(dir, "planmode.yaml"), "utf-8");
    const manifest = parse(raw);
    expect(manifest.category).toBe("backend");
  });

  it("defaults category to 'other'", () => {
    const dir = useTmpDir();
    createPackage({
      name: "no-cat",
      type: "plan",
      description: "No category",
      author: "testuser",
      projectDir: dir,
    });
    const raw = fs.readFileSync(path.join(dir, "planmode.yaml"), "utf-8");
    const manifest = parse(raw);
    expect(manifest.category).toBe("other");
  });

  it("returns correct InitResult", () => {
    const dir = useTmpDir();
    const result = createPackage({
      name: "result-test",
      type: "rule",
      description: "Testing result",
      author: "testuser",
      projectDir: dir,
    });
    expect(result.files).toEqual(["planmode.yaml", "rule.md"]);
    expect(result.manifestPath).toBe(path.join(dir, "planmode.yaml"));
    expect(result.contentPath).toBe(path.join(dir, "rule.md"));
  });
});
