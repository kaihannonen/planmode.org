import fs from "node:fs";
import path from "node:path";
import { readManifest, validateManifest, readPackageContent } from "./manifest.js";
import { renderTemplate, collectVariableValues } from "./template.js";
import { searchPackages } from "./registry.js";

export interface TestIssue {
  severity: "error" | "warning";
  check: string;
  message: string;
}

export interface TestResult {
  issues: TestIssue[];
  passed: boolean;
  checks: { name: string; passed: boolean }[];
}

export async function testPackage(projectDir: string = process.cwd()): Promise<TestResult> {
  const issues: TestIssue[] = [];
  const checks: { name: string; passed: boolean }[] = [];

  // 1. Manifest exists and parses
  let manifest;
  try {
    manifest = readManifest(projectDir);
    checks.push({ name: "Manifest parses", passed: true });
  } catch (err) {
    issues.push({
      severity: "error",
      check: "Manifest parses",
      message: (err as Error).message,
    });
    checks.push({ name: "Manifest parses", passed: false });
    return { issues, passed: false, checks };
  }

  // 2. Manifest validates for publishing
  const errors = validateManifest(manifest, true);
  if (errors.length === 0) {
    checks.push({ name: "Manifest valid for publishing", passed: true });
  } else {
    for (const err of errors) {
      issues.push({
        severity: "error",
        check: "Manifest valid for publishing",
        message: err,
      });
    }
    checks.push({ name: "Manifest valid for publishing", passed: false });
  }

  // 3. Content file exists and is readable
  let content: string | undefined;
  try {
    content = readPackageContent(projectDir, manifest);
    if (content.trim().length === 0) {
      issues.push({
        severity: "warning",
        check: "Content is non-empty",
        message: "Content file is empty",
      });
      checks.push({ name: "Content is non-empty", passed: false });
    } else {
      checks.push({ name: "Content is non-empty", passed: true });
    }
  } catch (err) {
    issues.push({
      severity: "error",
      check: "Content readable",
      message: (err as Error).message,
    });
    checks.push({ name: "Content readable", passed: false });
  }

  // 4. Template renders with default values
  if (content && manifest.variables && Object.keys(manifest.variables).length > 0) {
    try {
      // Check all required variables have defaults
      const missingDefaults: string[] = [];
      for (const [name, def] of Object.entries(manifest.variables)) {
        if (def.required && def.default === undefined) {
          missingDefaults.push(name);
        }
      }

      if (missingDefaults.length > 0) {
        issues.push({
          severity: "warning",
          check: "Required variables have defaults",
          message: `Required variables without defaults: ${missingDefaults.join(", ")}. Users must provide these at install time.`,
        });
        checks.push({ name: "Required variables have defaults", passed: false });
      } else {
        checks.push({ name: "Required variables have defaults", passed: true });
      }

      // Try rendering with defaults only
      const values = collectVariableValues(manifest.variables, {});
      renderTemplate(content, values);
      checks.push({ name: "Template renders with defaults", passed: true });
    } catch (err) {
      issues.push({
        severity: "error",
        check: "Template renders with defaults",
        message: (err as Error).message,
      });
      checks.push({ name: "Template renders with defaults", passed: false });
    }
  }

  // 5. Dependencies exist in registry
  if (manifest.dependencies) {
    const allDeps = [
      ...(manifest.dependencies.rules ?? []),
      ...(manifest.dependencies.plans ?? []),
    ];

    for (const dep of allDeps) {
      const depName = dep.includes("@") ? dep.split("@")[0]! : dep;
      try {
        const results = await searchPackages(depName);
        const found = results.some((r) => r.name === depName);
        if (found) {
          checks.push({ name: `Dependency "${depName}" exists`, passed: true });
        } else {
          issues.push({
            severity: "warning",
            check: `Dependency "${depName}" exists`,
            message: `Dependency "${depName}" not found in registry. It may not be published yet.`,
          });
          checks.push({ name: `Dependency "${depName}" exists`, passed: false });
        }
      } catch {
        issues.push({
          severity: "warning",
          check: `Dependency "${depName}" exists`,
          message: `Could not check registry for "${depName}" (network error)`,
        });
        checks.push({ name: `Dependency "${depName}" exists`, passed: false });
      }
    }
  }

  // 6. Content file size check
  if (content) {
    const sizeKb = Buffer.byteLength(content, "utf-8") / 1024;
    if (sizeKb > 100) {
      issues.push({
        severity: "warning",
        check: "Content size reasonable",
        message: `Content is ${sizeKb.toFixed(1)}KB. Large packages may hit token limits in AI models.`,
      });
      checks.push({ name: "Content size reasonable", passed: false });
    } else {
      checks.push({ name: "Content size reasonable", passed: true });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return { issues, passed: !hasErrors, checks };
}
