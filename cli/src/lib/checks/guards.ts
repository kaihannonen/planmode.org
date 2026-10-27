import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import type {
  CheckDefinition,
  CheckReport,
  CheckResult,
  GuardDefinition,
  GuardsFile,
} from "./types.js";
import { readGuards, guardFilePath } from "./config.js";
import { runSingleCheck } from "./engine.js";

export interface GuardVerification {
  id: string;
  verified: boolean;
  issues: string[];
  bad?: {
    status: string;
    detail: string;
  };
  good?: {
    status: string;
    detail: string;
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "guard";
}

export function makeGuardId(resultName: string): string {
  return `prevent-${slugify(resultName)}`;
}

export function verifyGuard(
  guard: GuardDefinition,
  projectDir: string,
): GuardVerification {
  const issues: string[] = [];
  const check: CheckDefinition = {
    ...guard.check,
    name: guard.id,
    severity: guard.severity ?? "error",
    guard: guard.id,
  };

  if (!guard.fixtures?.bad && !guard.fixtures?.good) {
    return {
      id: guard.id,
      verified: false,
      issues: [
        "no fixtures: add --bad <dir> and --good <dir> so the guard can prove it discriminates",
      ],
    };
  }

  let bad: GuardVerification["bad"];
  if (guard.fixtures?.bad) {
    const dir = path.resolve(projectDir, guard.fixtures.bad);
    if (!fs.existsSync(dir)) {
      issues.push(`bad fixture not found: ${guard.fixtures.bad}`);
    } else {
      const result = runSingleCheck(check, { targetDir: dir });
      bad = { status: result.status, detail: result.detail };
      if (result.status !== "fail" && result.status !== "error") {
        issues.push(
          `bad fixture did not fail (${result.status}: ${result.detail}) — the guard does not catch the bug`,
        );
      } else if (
        guard.check.kind === "grep-absent" &&
        (result.match_count ?? 0) === 0
      ) {
        issues.push(
          "bad fixture failed because no files matched the guard scope, not because the bug was present — the guard is vacuous",
        );
      } else if (
        guard.check.kind === "grep-present" &&
        result.detail.startsWith("no files matched")
      ) {
        issues.push(
          "bad fixture failed because no files matched the guard scope — the guard is vacuous",
        );
      }
    }
  }

  let good: GuardVerification["good"];
  if (guard.fixtures?.good) {
    const dir = path.resolve(projectDir, guard.fixtures.good);
    if (!fs.existsSync(dir)) {
      issues.push(`good fixture not found: ${guard.fixtures.good}`);
    } else {
      const result = runSingleCheck(check, { targetDir: dir });
      good = { status: result.status, detail: result.detail };
      if (result.status !== "pass") {
        issues.push(
          `good fixture did not pass (${result.status}: ${result.detail}) — the guard has false positives`,
        );
      }
    }
  }

  if (!guard.fixtures?.bad) issues.push("no bad fixture: the guard is not proven to catch the bug");
  if (!guard.fixtures?.good) issues.push("no good fixture: the guard is not proven to avoid false positives");

  return {
    id: guard.id,
    verified: issues.length === 0,
    issues,
    bad,
    good,
  };
}

export function writeGuardsFile(file: string, data: GuardsFile): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stringify(data), "utf-8");
}

export interface AddGuardOptions {
  targetDir: string;
  guardsPath?: string;
  guard: GuardDefinition;
  force?: boolean;
  verify?: boolean;
}

export function addGuard(options: AddGuardOptions): {
  guard: GuardDefinition;
  file: string;
  verification?: GuardVerification;
} {
  const file = guardFilePath(options.targetDir, options.guardsPath);
  const data = readGuards(options.targetDir, options.guardsPath);

  if (data.guards.some((guard) => guard.id === options.guard.id)) {
    throw new Error(`Guard "${options.guard.id}" already exists in ${file}`);
  }

  let verification: GuardVerification | undefined;
  if (options.verify !== false) {
    verification = verifyGuard(options.guard, options.targetDir);
    if (!verification.verified && !options.force) {
      throw new Error(
        `Guard "${options.guard.id}" is not proven to discriminate:\n` +
          verification.issues.map((issue) => `  - ${issue}`).join("\n") +
          `\nUse --force to add it unverified.`,
      );
    }
  }

  const guard: GuardDefinition = {
    ...options.guard,
    verified: verification?.verified ?? false,
  };
  data.guards.push(guard);
  writeGuardsFile(file, data);
  return { guard, file, verification };
}

export function guardsToYaml(guards: GuardDefinition[]): string {
  return stringify({ version: 1, guards });
}

export function proposeGuards(
  failures: Array<{ result: CheckResult; definition: CheckDefinition }>,
  source: string,
): GuardDefinition[] {
  const used = new Set<string>();
  const guards: GuardDefinition[] = [];

  for (const { result, definition } of failures) {
    if (result.status !== "fail" && result.status !== "error") continue;
    // A failing guard is already a permanent check. Do not suggest a guard for
    // a guard; fix the code or retire the guard deliberately.
    if (definition.guard || result.guard) continue;
    let id = makeGuardId(result.name);
    let suffix = 2;
    while (used.has(id)) {
      id = `${makeGuardId(result.name)}-${suffix++}`;
    }
    used.add(id);

    guards.push({
      id,
      reason: `Prevent regression: ${result.name}`,
      source,
      created_at: new Date().toISOString(),
      severity: result.severity,
      check: {
        kind: definition.kind,
        path: definition.path,
        glob: definition.glob,
        pattern: definition.pattern,
        min: definition.min,
        run: definition.run,
        timeout: definition.timeout,
        hint: definition.hint,
      },
      verified: false,
    });
  }

  return guards;
}

export function suggestionsFromReport(report: CheckReport): GuardDefinition[] {
  if (report.suggested_guards.length > 0) return report.suggested_guards;
  const failures = report.results
    .filter((result) => result.definition)
    .map((result) => ({ result, definition: result.definition! }));
  return proposeGuards(failures, `check:${report.started_at}`);
}
