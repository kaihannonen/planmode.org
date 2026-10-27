import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  BaselineFile,
  CheckDefinition,
  CheckReport,
  CheckResult,
} from "./types.js";
import {
  changedFilesFromSnapshots,
  formatPath,
  snapshotDir,
} from "./glob.js";
import {
  checksFromGuards,
  checksFromHarness,
  loadHarness,
  readGuards,
} from "./config.js";
import { runSingleCheck } from "./engine.js";
import { proposeGuards, guardsToYaml } from "./guards.js";

export interface RunCheckOptions {
  targetDir?: string;
  harnessPath?: string;
  guardsPath?: string;
  baseDir?: string;
  baselinePath?: string;
  saveBaselinePath?: string;
  changedOnly?: boolean;
  skipCommands?: boolean;
  rerunFailures?: boolean;
  writeSuggestions?: boolean;
  reportDir?: string;
  agent?: string;
  model?: string;
  failOn?: "error" | "warn" | "never";
}

function readBaseline(file: string): BaselineFile {
  const raw = fs.readFileSync(file, "utf-8");
  const data = JSON.parse(raw) as BaselineFile;
  if (!data || data.version !== 1 || typeof data.files !== "object") {
    throw new Error(`Invalid baseline file: ${file}`);
  }
  return data;
}

function definitionHash(definition: CheckDefinition): string {
  const canonical = {
    name: definition.name,
    kind: definition.kind,
    severity: definition.severity ?? "error",
    path: definition.path ?? null,
    glob: definition.glob ?? null,
    pattern: definition.pattern ?? null,
    min: definition.min ?? null,
    run: definition.run ?? null,
    timeout: definition.timeout ?? null,
    hint: definition.hint ?? null,
    allow_empty: definition.allow_empty ?? null,
    guard: definition.guard ?? null,
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

function writeBaseline(
  file: string,
  report: CheckReport,
  targetDir: string,
  definitions: CheckDefinition[],
): void {
  const data: BaselineFile = {
    version: 1,
    created_at: new Date().toISOString(),
    harness: report.harness,
    files: snapshotDir(targetDir),
    results: Object.fromEntries(
      report.results.map((result) => [result.name, result.status]),
    ),
    definitions: Object.fromEntries(
      definitions.map((definition) => [
        definition.name,
        definitionHash(definition),
      ]),
    ),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function duplicateNames(definitions: CheckDefinition[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const definition of definitions) {
    if (seen.has(definition.name)) duplicates.add(definition.name);
    seen.add(definition.name);
  }
  return [...duplicates];
}

function summarize(results: CheckResult[]): {
  score: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
} {
  const counted = results.filter((result) => result.status !== "skipped");
  const weight = (result: CheckResult) =>
    result.severity === "warn" ? 0.5 : 1;
  const total = counted.reduce((sum, result) => sum + weight(result), 0);
  const earned = counted
    .filter((result) => result.status === "pass")
    .reduce((sum, result) => sum + weight(result), 0);

  return {
    score: total === 0 ? 100 : Math.round((earned / total) * 100),
    passed: results.filter((result) => result.status === "pass").length,
    failed: results.filter(
      (result) => result.status === "fail" || result.status === "error",
    ).length,
    skipped: results.filter((result) => result.status === "skipped").length,
    errors: results.filter((result) => result.status === "error").length,
  };
}

function relativePath(from: string, to: string): string {
  return formatPath(path.relative(from, to)) || ".";
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function formatProof(report: CheckReport): string {
  const lines: string[] = [];
  lines.push(`# Proof: ${report.harness} @ ${report.target}`);
  lines.push("");
  lines.push(`- Mode: **${report.mode}**${report.changed_files.length ? ` (${report.changed_files.length} changed file(s))` : ""}`);
  lines.push(`- Score: **${report.score}/100**`);
  lines.push(
    `- Results: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped${report.errors ? `, ${report.errors} error(s)` : ""}`,
  );
  if (report.agent?.id || report.agent?.model) {
    lines.push(
      `- Agent: ${[report.agent.id, report.agent.model].filter(Boolean).join(" / ")}`,
    );
  }
  if (report.base) lines.push(`- Base: \`${report.base}\``);
  if (report.baseline) lines.push(`- Baseline: \`${report.baseline}\``);
  lines.push("");

  lines.push("## Checks");
  lines.push("");
  lines.push("| Check | Severity | Result | Detail |");
  lines.push("|---|---|---|---|");
  for (const result of report.results) {
    lines.push(
      `| ${escapeCell(result.name)} | ${result.severity} | ${result.status} | ${escapeCell(result.detail)} |`,
    );
  }
  lines.push("");

  if (report.new_failures.length > 0) {
    lines.push("## New failures");
    lines.push("");
    for (const name of report.new_failures) lines.push(`- ${name}`);
    lines.push("");
  }

  if (report.fixed.length > 0) {
    lines.push("## Fixed since baseline");
    lines.push("");
    for (const name of report.fixed) lines.push(`- ${name}`);
    lines.push("");
  }

  if (report.flaky.length > 0) {
    lines.push("## Flaky checks");
    lines.push("");
    lines.push(
      "These command checks failed once and passed on a rerun. Treat the result as lower confidence.",
    );
    lines.push("");
    for (const name of report.flaky) lines.push(`- ${name}`);
    lines.push("");
  }

  if (report.definition_changes.length > 0) {
    lines.push("## Changed check definitions");
    lines.push("");
    lines.push(
      "These checks changed since the baseline, so their previous status is not trusted.",
    );
    lines.push("");
    for (const name of report.definition_changes) lines.push(`- ${name}`);
    lines.push("");
  }

  lines.push("## Not verified");
  lines.push("");
  if (report.not_verified.length === 0) {
    lines.push("_None._");
  } else {
    for (const item of report.not_verified) lines.push(`- ${item}`);
  }
  lines.push("");

  if (report.suggested_guards.length > 0) {
    lines.push("## Suggested guards");
    lines.push("");
    lines.push(
      "These are deterministic checks derived from failures. Add fixtures and run",
    );
    lines.push("`planmode guard add` so the guard is proven to discriminate.");
    lines.push("");
    lines.push("```yaml");
    lines.push(guardsToYaml(report.suggested_guards).trimEnd());
    lines.push("```");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export function formatCheckReport(report: CheckReport): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(
    `${report.harness}${report.harness_version ? `@${report.harness_version}` : ""} @ ${report.target}`,
  );
  lines.push(
    `mode ${report.mode}${report.changed_files.length ? ` · ${report.changed_files.length} changed file(s)` : ""}`,
  );
  lines.push("");

  for (const result of report.results) {
    const symbol =
      result.status === "pass"
        ? "✓"
        : result.status === "skipped"
          ? "·"
          : "✗";
    const severity = result.severity === "warn" ? " (warn)" : "";
    lines.push(`  ${symbol} ${result.name}${severity}`);
    if (result.status !== "pass") {
      if (result.detail) lines.push(`      ${result.detail}`);
      if (result.hint) lines.push(`      hint: ${result.hint}`);
      for (const match of result.matches ?? []) {
        lines.push(`      ${match.file}:${match.line}  ${match.text}`);
      }
      if (result.output) {
        for (const line of result.output.split("\n")) {
          lines.push(`      ${line}`);
        }
      }
    }
  }

  lines.push("");
  lines.push(
    `  score ${report.score}/100 · ${report.passed} passed · ${report.failed} failed` +
      (report.skipped ? ` · ${report.skipped} skipped` : ""),
  );

  if (report.new_failures.length > 0) {
    lines.push(`  new failures: ${report.new_failures.join(", ")}`);
  }
  if (report.fixed.length > 0) {
    lines.push(`  fixed since baseline: ${report.fixed.join(", ")}`);
  }
  if (report.flaky.length > 0) {
    lines.push(`  flaky on rerun: ${report.flaky.join(", ")}`);
  }
  if (report.definition_changes.length > 0) {
    lines.push(
      `  check definitions changed since baseline: ${report.definition_changes.join(", ")}`,
    );
  }
  if (report.not_verified.length > 0) {
    lines.push("  not verified:");
    for (const item of report.not_verified) lines.push(`    - ${item}`);
  }
  if (report.suggested_guards.length > 0) {
    lines.push(
      `  suggested guards: ${report.suggested_guards.map((guard) => guard.id).join(", ")}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function runCheck(options: RunCheckOptions = {}): CheckReport {
  const startedAt = Date.now();
  const targetDir = path.resolve(options.targetDir ?? process.cwd());
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Target not found: ${targetDir}`);
  }
  if (!fs.statSync(targetDir).isDirectory()) {
    throw new Error(`Target must be a directory: ${targetDir}`);
  }

  const guards = readGuards(targetDir, options.guardsPath);
  const loadedHarness = loadHarness(targetDir, options.harnessPath);
  const harness = loadedHarness ?? (guards.guards.length > 0
    ? {
        dir: targetDir,
        file: path.join(targetDir, ".planmode", "guards.yaml"),
        manifest: { name: "guards" },
      }
    : null);
  if (!harness) {
    throw new Error(
      "No harness or guards found. Pass --harness <dir>, add harness.yaml or .planmode/harness.yaml, or add a guard.",
    );
  }

  const definitions = [
    ...checksFromHarness(harness.manifest, !options.skipCommands),
    ...checksFromGuards(guards.guards),
  ];

  if (definitions.length === 0) {
    throw new Error(
      `No checks found in ${harness.file}. Add evals, verification.commands, or guards.`,
    );
  }

  const duplicates = duplicateNames(definitions);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate check names: ${duplicates.join(", ")}`);
  }

  let baseSnapshot: Record<string, string> | undefined;
  let baseline: BaselineFile | undefined;
  if (options.baselinePath) {
    baseline = readBaseline(path.resolve(options.baselinePath));
    baseSnapshot = baseline.files;
  }
  if (options.baseDir) {
    const baseDir = path.resolve(options.baseDir);
    if (!fs.existsSync(baseDir)) {
      throw new Error(`Base directory not found: ${baseDir}`);
    }
    baseSnapshot = snapshotDir(baseDir);
  }
  if (options.changedOnly && !baseSnapshot) {
    throw new Error(
      "--changed-only needs --base-dir <dir> or --baseline <file>; no git commit is required.",
    );
  }

  const targetSnapshot =
    baseSnapshot || options.saveBaselinePath
      ? snapshotDir(targetDir)
      : undefined;
  const changedFiles = baseSnapshot
    ? changedFilesFromSnapshots(baseSnapshot, targetSnapshot!)
    : [];
  const changedSet = baseSnapshot ? new Set(changedFiles) : undefined;

  const baselineResults = baseline?.results ?? {};
  const baselineDefinitions = baseline?.definitions ?? {};
  const definitionChanges = definitions
    .filter((definition) => {
      const previous = baselineDefinitions[definition.name];
      return previous !== undefined && previous !== definitionHash(definition);
    })
    .map((definition) => definition.name);
  const changedDefinitionSet = new Set(definitionChanges);

  const results: CheckResult[] = [];
  for (const definition of definitions) {
    const result = runSingleCheck(definition, {
      targetDir,
      // A changed check cannot use the old changed-file scope. Run it against
      // the full target so a weakened definition cannot hide a failure.
      changedFiles: changedDefinitionSet.has(definition.name)
        ? undefined
        : changedSet,
      skipCommands: options.skipCommands,
    });
    if (result.status === "fail" || result.status === "error") {
      result.definition = definition;
    }
    results.push(result);
  }

  if (options.rerunFailures) {
    for (const result of results) {
      if (
        (result.status !== "fail" && result.status !== "error") ||
        result.definition?.kind !== "command"
      ) {
        continue;
      }
      const firstStatus = result.status;
      const firstDetail = result.detail;
      const firstOutput = result.output;
      const rerun = runSingleCheck(result.definition, {
        targetDir,
        changedFiles: changedDefinitionSet.has(result.name)
          ? undefined
          : changedSet,
        skipCommands: options.skipCommands,
      });
      result.attempts = 2;
      if (rerun.status === "pass") {
        result.flaky = true;
        result.first_attempt_status = firstStatus;
        result.first_attempt_detail = firstDetail;
        result.status = "pass";
        result.detail = `passed on rerun; first attempt ${firstStatus}: ${firstDetail}`;
        result.output = firstOutput
          ? `${firstOutput}\n--- rerun ---\n${rerun.output ?? ""}`.trim()
          : rerun.output;
        result.exit_code = rerun.exit_code;
      } else {
        result.detail = `${firstDetail} (failed on rerun too)`;
        result.output = [firstOutput, rerun.output]
          .filter(Boolean)
          .join("\n--- rerun ---\n");
        result.exit_code = rerun.exit_code;
      }
    }
  }

  const summary = summarize(results);
  const newFailures = results
    .filter((result) => {
      if (result.status !== "fail" && result.status !== "error") return false;
      const wasFailing =
        baselineResults[result.name] === "fail" ||
        baselineResults[result.name] === "error";
      // A changed check is not a trustworthy baseline. If it fails, fail closed
      // and treat it as a new failure.
      return !wasFailing || changedDefinitionSet.has(result.name);
    })
    .map((result) => result.name);
  const fixed = results
    .filter(
      (result) =>
        result.status === "pass" &&
        !result.flaky &&
        !changedDefinitionSet.has(result.name) &&
        (baselineResults[result.name] === "fail" ||
          baselineResults[result.name] === "error"),
    )
    .map((result) => result.name);
  const flaky = results
    .filter((result) => result.flaky)
    .map((result) => result.name);

  const notVerified: string[] = [];
  if (options.skipCommands) {
    notVerified.push("verification commands were skipped (--skip-commands)");
  }
  for (const guard of guards.guards) {
    if (guard.verified !== true) {
      notVerified.push(
        `guard:${guard.id}: not verified against bad/good fixtures`,
      );
    }
  }
  for (const result of results) {
    if (result.status === "skipped") {
      notVerified.push(`${result.name}: ${result.detail}`);
    }
  }

  // Only suggest guards for failures introduced by this change. Pre-existing
  // failures are recorded in the baseline and should not flood the loop.
  const newFailureSet = new Set(newFailures);
  const failures = results
    .filter((result) => result.definition && newFailureSet.has(result.name))
    .map((result) => ({ result, definition: result.definition! }));
  const suggestedGuards = proposeGuards(
    failures,
    `check:${new Date(startedAt).toISOString()}`,
  );

  const targetLabel = relativePath(process.cwd(), targetDir);
  const report: CheckReport = {
    version: 1,
    harness:
      harness.manifest.name ?? path.basename(harness.dir) ?? "harness",
    harness_version: harness.manifest.version,
    target: targetLabel.startsWith("..") ? targetDir : targetLabel,
    mode: baseSnapshot ? "changed" : "full",
    base: options.baseDir,
    baseline: options.baselinePath,
    agent:
      options.agent || options.model
        ? { id: options.agent, model: options.model }
        : undefined,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: targetDir,
    },
    started_at: new Date(startedAt).toISOString(),
    duration_ms: Date.now() - startedAt,
    ...summary,
    changed_files: changedFiles,
    results,
    fixed,
    flaky,
    new_failures: newFailures,
    definition_changes: definitionChanges,
    not_verified: notVerified,
    suggested_guards: suggestedGuards,
  };

  if (options.saveBaselinePath) {
    writeBaseline(
      path.resolve(options.saveBaselinePath),
      report,
      targetDir,
      definitions,
    );
  }

  if (options.reportDir) {
    const reportDir = path.resolve(options.reportDir);
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportDir, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf-8",
    );
    fs.writeFileSync(
      path.join(reportDir, "PROOF.md"),
      formatProof(report),
      "utf-8",
    );
    if (suggestedGuards.length > 0) {
      fs.writeFileSync(
        path.join(reportDir, "guards.proposed.yaml"),
        guardsToYaml(suggestedGuards),
        "utf-8",
      );
    }
  }

  if (options.writeSuggestions && suggestedGuards.length > 0) {
    fs.mkdirSync(path.join(targetDir, ".planmode"), { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, ".planmode", "guards.proposed.yaml"),
      guardsToYaml(suggestedGuards),
      "utf-8",
    );
  }

  return report;
}

export function checkShouldFail(
  report: CheckReport,
  failOn: "error" | "warn" | "never" = "error",
  allowUnverified = false,
): boolean {
  if (failOn === "never") return false;
  if (!allowUnverified && report.not_verified.length > 0) return true;
  if (failOn === "warn") {
    return report.results.some(
      (result) => result.status === "fail" || result.status === "error",
    );
  }
  return report.results.some(
    (result) =>
      (result.status === "fail" || result.status === "error") &&
      result.severity === "error",
  );
}
