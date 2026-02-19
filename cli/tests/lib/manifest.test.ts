import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import {
  parseManifest,
  validateManifest,
  readManifest,
  readPackageContent,
} from "../../src/lib/manifest.js";
import { validManifest, createTmpDir, writeFile } from "../helpers.js";
import { stringify } from "yaml";

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

// ── parseManifest ──

describe("parseManifest", () => {
  it("parses valid YAML into a manifest object", () => {
    const raw = stringify({ name: "foo", version: "1.0.0", type: "plan" });
    const result = parseManifest(raw);
    expect(result.name).toBe("foo");
    expect(result.version).toBe("1.0.0");
    expect(result.type).toBe("plan");
  });

  it("parses a full manifest with all fields", () => {
    const manifest = validManifest({
      tags: ["frontend"],
      category: "frontend",
      dependencies: { rules: ["ts-strict"] },
      variables: {
        name: { description: "Project name", type: "string", required: true },
      },
      content: "Hello {{name}}",
    });
    const result = parseManifest(stringify(manifest));
    expect(result.name).toBe("test-package");
    expect(result.tags).toEqual(["frontend"]);
    expect(result.variables?.name?.type).toBe("string");
  });

  it("throws on empty string", () => {
    expect(() => parseManifest("")).toThrow("Invalid YAML");
  });

  it("throws when YAML is not an object (e.g. a string)", () => {
    expect(() => parseManifest("just a string")).toThrow("Invalid YAML");
  });

  it("throws on malformed YAML", () => {
    expect(() => parseManifest(":\n  :\n: [invalid")).toThrow();
  });
});

// ── validateManifest — required fields ──

describe("validateManifest — required fields", () => {
  it("reports missing name", () => {
    const errors = validateManifest(validManifest({ name: "" }));
    expect(errors).toContainEqual(expect.stringContaining("name"));
  });

  it("reports missing version", () => {
    const errors = validateManifest(validManifest({ version: "" }));
    expect(errors).toContainEqual(expect.stringContaining("version"));
  });

  it("reports missing type", () => {
    const errors = validateManifest(validManifest({ type: "" as any }));
    expect(errors).toContainEqual(expect.stringContaining("type"));
  });

  it("returns no errors for a valid minimal manifest", () => {
    const errors = validateManifest(validManifest());
    expect(errors).toHaveLength(0);
  });

  it("reports multiple errors at once", () => {
    const errors = validateManifest({ name: "", version: "", type: "" } as any);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("returns no errors for a fully valid manifest", () => {
    const errors = validateManifest(
      validManifest({
        tags: ["frontend", "react"],
        category: "frontend",
        variables: {
          framework: {
            description: "Framework",
            type: "enum",
            options: ["nextjs", "remix"],
          },
        },
        content: "some content",
      }),
    );
    expect(errors).toHaveLength(0);
  });
});

// ── validateManifest — name validation ──

describe("validateManifest — name validation", () => {
  it("accepts lowercase with hyphens", () => {
    const errors = validateManifest(validManifest({ name: "my-cool-pkg" }));
    expect(errors).toHaveLength(0);
  });

  it("accepts scoped names (@org/name)", () => {
    const errors = validateManifest(validManifest({ name: "@myorg/my-pkg" }));
    expect(errors).toHaveLength(0);
  });

  it("rejects uppercase letters", () => {
    const errors = validateManifest(validManifest({ name: "MyPackage" }));
    expect(errors.some((e) => e.includes("Invalid name"))).toBe(true);
  });

  it("rejects leading hyphen", () => {
    const errors = validateManifest(validManifest({ name: "-bad-name" }));
    expect(errors.some((e) => e.includes("Invalid name"))).toBe(true);
  });

  it("rejects underscores", () => {
    const errors = validateManifest(validManifest({ name: "bad_name" }));
    expect(errors.some((e) => e.includes("Invalid name"))).toBe(true);
  });

  it("rejects names over 100 characters", () => {
    const longName = "a".repeat(101);
    const errors = validateManifest(validManifest({ name: longName }));
    // Name regex actually fails for 101 'a's (still valid regex match) so let's check the length guard
    // Actually the regex ^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-]*$ will match a long name — the length check is separate
    expect(errors.some((e) => e.includes("100 characters"))).toBe(true);
  });
});

// ── validateManifest — version validation ──

describe("validateManifest — version validation", () => {
  it("accepts valid semver", () => {
    const errors = validateManifest(validManifest({ version: "2.3.4" }));
    expect(errors).toHaveLength(0);
  });

  it("rejects pre-release tags", () => {
    const errors = validateManifest(validManifest({ version: "1.0.0-beta.1" }));
    expect(errors.some((e) => e.includes("semver"))).toBe(true);
  });

  it("rejects two-part version", () => {
    const errors = validateManifest(validManifest({ version: "1.0" }));
    expect(errors.some((e) => e.includes("semver"))).toBe(true);
  });

  it("rejects non-numeric", () => {
    const errors = validateManifest(validManifest({ version: "abc" }));
    expect(errors.some((e) => e.includes("semver"))).toBe(true);
  });
});

// ── validateManifest — type validation ──

describe("validateManifest — type validation", () => {
  it("accepts plan", () => {
    expect(validateManifest(validManifest({ type: "plan" }))).toHaveLength(0);
  });

  it("accepts rule", () => {
    expect(validateManifest(validManifest({ type: "rule" }))).toHaveLength(0);
  });

  it("accepts prompt", () => {
    expect(validateManifest(validManifest({ type: "prompt" }))).toHaveLength(0);
  });

  it("rejects invalid type", () => {
    const errors = validateManifest(validManifest({ type: "widget" as any }));
    expect(errors.some((e) => e.includes("Invalid type"))).toBe(true);
  });
});

// ── validateManifest — publish fields ──

describe("validateManifest — publish fields", () => {
  it("does not require publish fields by default", () => {
    const manifest = { name: "foo", version: "1.0.0", type: "plan" } as any;
    const errors = validateManifest(manifest);
    expect(errors).toHaveLength(0);
  });

  it("requires description, author, license when requirePublishFields is true", () => {
    const manifest = { name: "foo", version: "1.0.0", type: "plan" } as any;
    const errors = validateManifest(manifest, true);
    expect(errors.some((e) => e.includes("description"))).toBe(true);
    expect(errors.some((e) => e.includes("author"))).toBe(true);
    expect(errors.some((e) => e.includes("license"))).toBe(true);
  });

  it("rejects description over 200 characters", () => {
    const manifest = validManifest({ description: "x".repeat(201) });
    const errors = validateManifest(manifest, true);
    expect(errors.some((e) => e.includes("200 characters"))).toBe(true);
  });
});

// ── validateManifest — tags ──

describe("validateManifest — tags", () => {
  it("accepts valid tags", () => {
    const errors = validateManifest(validManifest({ tags: ["frontend", "react-18"] }));
    expect(errors).toHaveLength(0);
  });

  it("rejects more than 10 tags", () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    const errors = validateManifest(validManifest({ tags }));
    expect(errors.some((e) => e.includes("10 tags"))).toBe(true);
  });

  it("rejects invalid tag characters", () => {
    const errors = validateManifest(validManifest({ tags: ["INVALID"] }));
    expect(errors.some((e) => e.includes("Invalid tag"))).toBe(true);
  });
});

// ── validateManifest — category ──

describe("validateManifest — category", () => {
  it("accepts valid categories", () => {
    expect(validateManifest(validManifest({ category: "frontend" }))).toHaveLength(0);
    expect(validateManifest(validManifest({ category: "ai-ml" }))).toHaveLength(0);
  });

  it("rejects invalid category", () => {
    const errors = validateManifest(validManifest({ category: "invalid" as any }));
    expect(errors.some((e) => e.includes("Invalid category"))).toBe(true);
  });
});

// ── validateManifest — dependencies ──

describe("validateManifest — dependencies", () => {
  it("rejects dependencies on prompt type", () => {
    const errors = validateManifest(
      validManifest({ type: "prompt", dependencies: { rules: ["foo"] } }),
    );
    expect(errors.some((e) => e.includes("Dependencies are not allowed"))).toBe(true);
  });

  it("allows dependencies on plan type", () => {
    const errors = validateManifest(
      validManifest({ type: "plan", dependencies: { rules: ["foo"] } }),
    );
    expect(errors).toHaveLength(0);
  });
});

// ── validateManifest — variables ──

describe("validateManifest — variables", () => {
  it("accepts valid variable definitions", () => {
    const errors = validateManifest(
      validManifest({
        variables: {
          name: { description: "Name", type: "string" },
          count: { description: "Count", type: "number" },
          flag: { description: "Flag", type: "boolean" },
          mode: { description: "Mode", type: "enum", options: ["a", "b"] },
          data: { description: "Data", type: "resolved", source: "https://example.com" },
        },
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it("rejects invalid variable type", () => {
    const errors = validateManifest(
      validManifest({
        variables: {
          x: { description: "X", type: "invalid" as any },
        },
      }),
    );
    expect(errors.some((e) => e.includes("invalid type"))).toBe(true);
  });

  it("rejects enum without options", () => {
    const errors = validateManifest(
      validManifest({
        variables: {
          x: { description: "X", type: "enum" },
        },
      }),
    );
    expect(errors.some((e) => e.includes("enum must have options"))).toBe(true);
  });
});

// ── validateManifest — content ──

describe("validateManifest — content", () => {
  it("rejects both content and content_file", () => {
    const errors = validateManifest(
      validManifest({ content: "hello", content_file: "plan.md" }),
    );
    expect(errors.some((e) => e.includes("Cannot specify both"))).toBe(true);
  });
});

// ── readManifest ──

describe("readManifest", () => {
  it("reads and parses planmode.yaml from a directory", () => {
    const dir = useTmpDir();
    writeFile(dir, "planmode.yaml", stringify(validManifest()));
    const manifest = readManifest(dir);
    expect(manifest.name).toBe("test-package");
  });

  it("throws when planmode.yaml is missing", () => {
    const dir = useTmpDir();
    expect(() => readManifest(dir)).toThrow("No planmode.yaml found");
  });

  it("throws on invalid YAML", () => {
    const dir = useTmpDir();
    writeFile(dir, "planmode.yaml", ":\n: [invalid");
    expect(() => readManifest(dir)).toThrow();
  });
});

// ── readPackageContent ──

describe("readPackageContent", () => {
  it("returns inline content", () => {
    const manifest = validManifest({ content: "inline content here" });
    expect(readPackageContent("/unused", manifest)).toBe("inline content here");
  });

  it("reads content from content_file", () => {
    const dir = useTmpDir();
    writeFile(dir, "plan.md", "# My Plan\n\nSteps...");
    const manifest = validManifest({ content_file: "plan.md" });
    expect(readPackageContent(dir, manifest)).toBe("# My Plan\n\nSteps...");
  });

  it("throws when content_file is missing on disk", () => {
    const dir = useTmpDir();
    const manifest = validManifest({ content_file: "missing.md" });
    expect(() => readPackageContent(dir, manifest)).toThrow("Content file not found");
  });

  it("throws when neither content nor content_file is set", () => {
    const manifest = validManifest();
    // validManifest doesn't set content or content_file
    expect(() => readPackageContent("/unused", manifest)).toThrow(
      "must specify either content or content_file",
    );
  });
});
