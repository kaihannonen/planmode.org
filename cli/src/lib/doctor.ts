import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readLockfile } from "./lockfile.js";
import { listImports } from "./claude-md.js";

export interface DiagnosticIssue {
  severity: "error" | "warning";
  message: string;
  fix?: string;
}

export interface DoctorResult {
  issues: DiagnosticIssue[];
  packagesChecked: number;
  healthy: boolean;
}

function computeHash(content: string): string {
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}

export function runDoctor(projectDir: string = process.cwd()): DoctorResult {
  const issues: DiagnosticIssue[] = [];
  const lockfile = readLockfile(projectDir);
  const entries = Object.entries(lockfile.packages);

  // Check each lockfile entry
  for (const [name, entry] of entries) {
    const fullPath = path.join(projectDir, entry.installed_to);

    // File exists?
    if (!fs.existsSync(fullPath)) {
      issues.push({
        severity: "error",
        message: `Missing file for "${name}": ${entry.installed_to}`,
        fix: `Run \`planmode install ${name}\` to reinstall`,
      });
      continue;
    }

    // Content hash matches?
    const content = fs.readFileSync(fullPath, "utf-8");
    const actualHash = computeHash(content);
    if (actualHash !== entry.content_hash) {
      issues.push({
        severity: "warning",
        message: `Content hash mismatch for "${name}" at ${entry.installed_to}`,
        fix: "File was modified locally. Run `planmode update " + name + "` to restore, or ignore if intentional",
      });
    }
  }

  // Check CLAUDE.md imports match installed plans
  const claudeMdPath = path.join(projectDir, "CLAUDE.md");
  const imports = listImports(projectDir);
  const installedPlans = entries
    .filter(([, entry]) => entry.type === "plan")
    .map(([name]) => name);

  // Plans in lockfile but missing from CLAUDE.md
  for (const planName of installedPlans) {
    if (!imports.includes(planName)) {
      issues.push({
        severity: "error",
        message: `Plan "${planName}" is installed but missing from CLAUDE.md imports`,
        fix: `Add \`- @plans/${planName}.md\` to the # Planmode section of CLAUDE.md`,
      });
    }
  }

  // Imports in CLAUDE.md that aren't in the lockfile
  for (const importName of imports) {
    if (!installedPlans.includes(importName)) {
      // Check if the file at least exists
      const filePath = path.join(projectDir, "plans", `${importName}.md`);
      if (!fs.existsSync(filePath)) {
        issues.push({
          severity: "error",
          message: `CLAUDE.md imports "${importName}" but the file doesn't exist at plans/${importName}.md`,
          fix: `Run \`planmode install ${importName}\` or remove the import from CLAUDE.md`,
        });
      } else {
        issues.push({
          severity: "warning",
          message: `CLAUDE.md imports "${importName}" but it's not tracked in planmode.lock`,
          fix: "This plan was added manually. No action needed unless you want lockfile tracking.",
        });
      }
    }
  }

  // Check CLAUDE.md exists if there are plans
  if (installedPlans.length > 0 && !fs.existsSync(claudeMdPath)) {
    issues.push({
      severity: "error",
      message: "CLAUDE.md is missing but plans are installed",
      fix: "Run `planmode install <any-plan>` to recreate it, or create it manually with a # Planmode section",
    });
  }

  // Check for orphaned files in plans/ that aren't tracked
  const plansDir = path.join(projectDir, "plans");
  if (fs.existsSync(plansDir)) {
    const planFiles = fs.readdirSync(plansDir).filter((f) => f.endsWith(".md"));
    for (const file of planFiles) {
      const name = file.replace(/\.md$/, "");
      if (!lockfile.packages[name]) {
        issues.push({
          severity: "warning",
          message: `Untracked plan file: plans/${file}`,
          fix: "This file isn't managed by planmode. Ignore if intentional.",
        });
      }
    }
  }

  return {
    issues,
    packagesChecked: entries.length,
    healthy: issues.filter((i) => i.severity === "error").length === 0,
  };
}
