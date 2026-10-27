import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { CheckReport } from "../checks/types.js";
import { runCheck } from "../checks/run.js";
import { guardFilePath, loadHarness } from "../checks/config.js";
import { diffProtected, snapshotProtected } from "./protected.js";
import type {
  LoopIteration,
  LoopOptions,
  LoopResult,
} from "./types.js";

const COPY_EXCLUDES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "target",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  "coverage",
  ".turbo",
  ".astro",
]);

const DEFAULT_PROTECTED = [
  ".planmode/guards.yaml",
  ".planmode/harness.yaml",
  "harness.yaml",
  "planmode.yaml",
  ".github/**",
];

const LINKED_DEPENDENCIES = [
  "node_modules",
  ".venv",
  "venv",
  "vendor",
  ".bundle",
];

function linkDependencies(source: string, destination: string): void {
  for (const name of LINKED_DEPENDENCIES) {
    const from = path.join(source, name);
    const to = path.join(destination, name);
    if (!fs.existsSync(from) || fs.existsSync(to)) continue;
    fs.symlinkSync(
      from,
      to,
      process.platform === "win32" ? "junction" : "dir",
    );
  }
}

function copyProject(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (src) => {
      const relative = path.relative(source, src);
      if (!relative) return true;
      const segments = relative.split(path.sep);
      if (segments.some((segment) => COPY_EXCLUDES.has(segment))) return false;
      if (segments[0] === ".planmode" && (segments[1] === "loop" || segments[1] === "runs")) {
        return false;
      }
      return true;
    },
  });
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function readPlan(planPath?: string): string | undefined {
  if (!planPath) return undefined;
  const resolved = path.resolve(planPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Plan not found: ${planPath}`);
  }
  return fs.readFileSync(resolved, "utf-8");
}

function failureSignature(report: CheckReport): string {
  const failing = report.results
    .filter((result) => result.status === "fail" || result.status === "error")
    .map((result) => result.name)
    .sort();
  return failing.join("|");
}

function buildPrompt(options: {
  workspace: string;
  plan?: string;
  failureFile?: string;
  iteration: number;
  protectedPaths: string[];
}): string {
  const lines: string[] = [];
  lines.push(`You are the builder in a verified development loop.`);
  lines.push("");
  lines.push(`Workspace: ${options.workspace}`);
  lines.push(`Iteration: ${options.iteration}`);
  lines.push("");
  lines.push(`Rules:`);
  lines.push(`- Work only inside the workspace.`);
  lines.push(`- Do not edit protected files: ${options.protectedPaths.join(", ")}.`);
  lines.push(`- Do not edit tests or checks to make them pass.`);
  lines.push(`- Make the smallest change that satisfies the plan.`);
  lines.push(`- Run the verification commands before you stop.`);
  lines.push("");
  lines.push(`## Plan`);
  lines.push("");
  lines.push(options.plan?.trim() || "No plan file was supplied. Infer the task from the failing checks.");
  lines.push("");

  if (options.failureFile && fs.existsSync(options.failureFile)) {
    lines.push(`## Previous verification failures`);
    lines.push("");
    lines.push(fs.readFileSync(options.failureFile, "utf-8").trim());
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function writeFailurePacket(
  file: string,
  report: CheckReport,
  protectedPaths: string[],
): void {
  const lines: string[] = [];
  lines.push(`# Verification failures`);
  lines.push("");
  lines.push(`Score: ${report.score}/100`);
  lines.push(`New failures: ${report.new_failures.length}`);
  lines.push("");

  for (const result of report.results) {
    if (result.status !== "fail" && result.status !== "error") continue;
    const isNew = report.new_failures.includes(result.name);
    lines.push(`## ${result.name}`);
    lines.push("");
    lines.push(`- Status: ${isNew ? "new failure" : "pre-existing failure"}`);
    lines.push(`- Kind: ${result.kind}`);
    lines.push(`- Severity: ${result.severity}`);
    lines.push(`- Detail: ${result.detail}`);
    if (result.hint) lines.push(`- Hint: ${result.hint}`);
    for (const match of result.matches ?? []) {
      lines.push(`- Match: ${match.file}:${match.line} ${match.text}`);
    }
    if (result.output) {
      lines.push("");
      lines.push("```");
      lines.push(result.output);
      lines.push("```");
    }
    lines.push("");
  }

  if (report.not_verified.length > 0) {
    lines.push(`## Not verified`);
    lines.push("");
    for (const item of report.not_verified) lines.push(`- ${item}`);
    lines.push("");
  }

  lines.push(`## Protected files`);
  lines.push("");
  for (const item of protectedPaths) lines.push(`- ${item}`);
  lines.push("");
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf-8");
}

function writeLoopSummary(result: LoopResult): void {
  const lines: string[] = [];
  lines.push(`# Loop result: ${result.status}`);
  lines.push("");
  lines.push(`- Reason: ${result.reason}`);
  lines.push(`- Workspace: \`${result.workspace}\``);
  lines.push(`- Iterations: ${result.iterations.length}`);
  if (result.finalReport) {
    lines.push(`- Final score: ${result.finalReport.score}/100`);
    lines.push(`- New failures: ${result.finalReport.new_failures.length}`);
  }
  if (result.guardsFile) {
    lines.push(`- Suggested guards: \`${result.guardsFile}\``);
  }
  lines.push("");
  lines.push("## Iterations");
  lines.push("");
  lines.push(
    "| # | Agent exit | Score | New failures | Regressions | Protected changes |",
  );
  lines.push("|---|---|---|---|---|---|");
  for (const iteration of result.iterations) {
    lines.push(
      `| ${iteration.iteration} | ${iteration.agentExitCode ?? "?"} | ${iteration.report.score} | ${iteration.newFailures.length} | ${iteration.regressions.length} | ${iteration.protectedChanges.length} |`,
    );
  }
  lines.push("");
  fs.writeFileSync(
    path.join(result.stateDir, "LOOP.md"),
    `${lines.join("\n")}\n`,
    "utf-8",
  );
}

function runAgent(
  command: string,
  workspace: string,
  env: Record<string, string>,
  timeoutSeconds: number,
): {
  status: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  error?: string;
} {
  const proc = spawnSync(command, {
    cwd: workspace,
    shell: true,
    encoding: "utf8",
    timeout: timeoutSeconds * 1000,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, ...env, CI: "1", NO_COLOR: "1" },
  });

  const errorCode = (proc.error as NodeJS.ErrnoException | undefined)?.code;
  return {
    status: proc.status,
    timedOut: errorCode === "ETIMEDOUT" || proc.signal === "SIGTERM",
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? "",
    error: proc.error ? String(proc.error.message ?? proc.error) : undefined,
  };
}

export function runLoop(options: LoopOptions): LoopResult {
  const sourceDir = path.resolve(options.sourceDir);
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source not found: ${sourceDir}`);
  }
  if (!fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Source must be a directory: ${sourceDir}`);
  }
  if (!options.agentCommand.trim()) {
    throw new Error("A builder command is required (--agent).");
  }

  const maxIterations = Math.floor(options.maxIterations ?? 3);
  if (!Number.isFinite(maxIterations) || maxIterations < 1) {
    throw new Error("--max-iterations must be a positive integer");
  }
  if (
    options.agentTimeout !== undefined &&
    (!Number.isFinite(options.agentTimeout) || options.agentTimeout <= 0)
  ) {
    throw new Error("--agent-timeout must be a positive number of seconds");
  }

  // Freeze the judge inputs outside the workspace. If the builder edits the
  // harness or guards, the check still uses the original files and the
  // protected-file snapshot stops the loop.
  const sourceHarness = loadHarness(sourceDir, options.harnessPath);
  const frozenHarnessPath = sourceHarness?.file;
  const sourceGuardsPath = path.resolve(
    options.guardsPath ?? guardFilePath(sourceDir),
  );
  const frozenGuardsPath = fs.existsSync(sourceGuardsPath)
    ? sourceGuardsPath
    : options.guardsPath;

  let workspace: string;
  if (options.workspace) {
    workspace = path.resolve(options.workspace);
    if (!fs.existsSync(workspace)) {
      throw new Error(`Workspace not found: ${workspace}`);
    }
    if (!fs.statSync(workspace).isDirectory()) {
      throw new Error(`Workspace must be a directory: ${workspace}`);
    }
    if (workspace === sourceDir) {
      throw new Error(
        "Workspace must differ from the source checkout. The loop never edits the source.",
      );
    }
  } else {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "planmode-loop-"));
    copyProject(sourceDir, workspace);
    if (options.linkDependencies) linkDependencies(sourceDir, workspace);
  }

  const runId = timestamp();
  const stateDir = path.resolve(
    options.reportDir ?? path.join(workspace, ".planmode", "loop", runId),
  );
  fs.mkdirSync(stateDir, { recursive: true });

  const plan = readPlan(options.planPath);
  const protectedPaths = options.protectedPaths?.length
    ? options.protectedPaths
    : DEFAULT_PROTECTED;
  const protectedBefore = snapshotProtected(workspace, protectedPaths);
  const baselineFile = path.join(stateDir, "baseline.json");

  const baselineReport = runCheck({
    targetDir: workspace,
    harnessPath: frozenHarnessPath,
    guardsPath: frozenGuardsPath,
    skipCommands: options.skipCommands,
    saveBaselinePath: baselineFile,
    reportDir: path.join(stateDir, "baseline"),
    agent: options.agentName ?? "loop",
  });

  if (baselineReport.failed > 0) {
    // Pre-existing failures are allowed; the baseline records them so only new
    // failures block the loop. Keep the report for inspection.
    fs.writeFileSync(
      path.join(stateDir, "baseline", "PREEXISTING.md"),
      [
        "# Pre-existing failures",
        "",
        "These failures were present before the builder ran and do not block the loop.",
        "",
        ...baselineReport.results
          .filter((result) => result.status === "fail" || result.status === "error")
          .map((result) => `- ${result.name}: ${result.detail}`),
        "",
      ].join("\n"),
      "utf-8",
    );
  }

  const iterations: LoopIteration[] = [];
  let previousSignature = failureSignature(baselineReport);
  let previousPassing = new Set(
    baselineReport.results
      .filter((result) => result.status === "pass")
      .map((result) => result.name),
  );
  let lastReport: CheckReport = baselineReport;
  let guardsFile: string | undefined;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const iterationDir = path.join(stateDir, `run-${iteration}`);
    fs.mkdirSync(iterationDir, { recursive: true });

    const previousFailureFile =
      iteration === 1
        ? undefined
        : path.join(stateDir, `run-${iteration - 1}`, "failures.md");
    const prompt = buildPrompt({
      workspace,
      plan,
      failureFile: previousFailureFile,
      iteration,
      protectedPaths,
    });
    const promptFile = path.join(iterationDir, "prompt.md");
    fs.writeFileSync(promptFile, prompt, "utf-8");

    const env: Record<string, string> = {
      PLANMODE_PROMPT: prompt,
      PLANMODE_PROMPT_FILE: promptFile,
      PLANMODE_ITERATION: String(iteration),
      PLANMODE_WORKSPACE: workspace,
      PLANMODE_PLAN: options.planPath ? path.resolve(options.planPath) : "",
      PLANMODE_FAILURE_FILE: previousFailureFile ?? "",
      ...options.env,
    };

    const startedAt = Date.now();
    const agent = runAgent(
      options.agentCommand,
      workspace,
      env,
      options.agentTimeout ?? 900,
    );
    const agentLog = path.join(iterationDir, "agent.log");
    fs.writeFileSync(
      agentLog,
      [
        `$ ${options.agentCommand}`,
        "",
        "## stdout",
        agent.stdout,
        "",
        "## stderr",
        agent.stderr,
        agent.error ? `\n## error\n${agent.error}` : "",
        "",
      ].join("\n"),
      "utf-8",
    );

    if (agent.error && agent.status === null && !agent.timedOut) {
      const result: LoopResult = {
        status: "failed",
        reason: `Builder command failed to launch: ${agent.error}`,
        workspace,
        stateDir,
        planFile: options.planPath ? path.resolve(options.planPath) : undefined,
        iterations,
        finalReport: lastReport,
        guardsFile,
      };
      writeLoopSummary(result);
      return result;
    }

    const protectedAfter = snapshotProtected(workspace, protectedPaths);
    const protectedChanges = diffProtected(protectedBefore, protectedAfter);
    if (protectedChanges.length > 0) {
      fs.writeFileSync(
        path.join(iterationDir, "protected-change.md"),
        [
          "# Protected files changed",
          "",
          "The builder changed files that are supposed to be immutable. The loop will stop.",
          "",
          ...protectedChanges.map((file) => `- ${file}`),
          "",
        ].join("\n"),
        "utf-8",
      );
    }

    const report = runCheck({
      targetDir: workspace,
      harnessPath: frozenHarnessPath,
      guardsPath: frozenGuardsPath,
      baselinePath: baselineFile,
      skipCommands: options.skipCommands,
      reportDir: iterationDir,
      agent: options.agentName ?? "loop",
    });
    lastReport = report;

    const currentPassing = new Set(
      report.results
        .filter((result) => result.status === "pass")
        .map((result) => result.name),
    );
    const regressions = [...previousPassing].filter(
      (name) => !currentPassing.has(name) && iteration > 1,
    );

    const signature = failureSignature(report);
    const hasErrors = report.results.some((result) => result.status === "error");
    const failureFile =
      report.new_failures.length > 0 || hasErrors
        ? path.join(iterationDir, "failures.md")
        : undefined;
    if (failureFile) {
      writeFailurePacket(failureFile, report, protectedPaths);
    }

    const suggested = path.join(iterationDir, "guards.proposed.yaml");
    if (fs.existsSync(suggested)) {
      guardsFile = path.join(stateDir, "guards.proposed.yaml");
      fs.copyFileSync(suggested, guardsFile);
    }

    iterations.push({
      iteration,
      agentExitCode: agent.status,
      agentTimedOut: agent.timedOut,
      report,
      failureSignature: signature,
      newFailures: report.new_failures,
      regressions,
      protectedChanges,
      promptFile,
      failureFile,
      agentLog,
      durationMs: Date.now() - startedAt,
    });

    const hasNewFailures = report.new_failures.length > 0;

    if (protectedChanges.length > 0) {
      const result: LoopResult = {
        status: "stopped",
        reason: `Protected files changed: ${protectedChanges.join(", ")}`,
        workspace,
        stateDir,
        planFile: options.planPath ? path.resolve(options.planPath) : undefined,
        iterations,
        finalReport: report,
        guardsFile,
      };
      writeLoopSummary(result);
      return result;
    }

    if (agent.timedOut) {
      const result: LoopResult = {
        status: "stopped",
        reason: `Builder timed out after ${options.agentTimeout ?? 900}s.`,
        workspace,
        stateDir,
        planFile: options.planPath ? path.resolve(options.planPath) : undefined,
        iterations,
        finalReport: report,
        guardsFile,
      };
      writeLoopSummary(result);
      return result;
    }

    if (!hasNewFailures && !hasErrors) {
      if (report.not_verified.length > 0 && !options.allowUnverified) {
        const result: LoopResult = {
          status: "inconclusive",
          reason:
            "No new failures, but some required checks were not verified. Use --allow-unverified to accept this.",
          workspace,
          stateDir,
          planFile: options.planPath ? path.resolve(options.planPath) : undefined,
          iterations,
          finalReport: report,
          guardsFile,
        };
        writeLoopSummary(result);
        return result;
      }

      const result: LoopResult = {
        status: "passed",
        reason: "All new checks passed.",
        workspace,
        stateDir,
        planFile: options.planPath ? path.resolve(options.planPath) : undefined,
        iterations,
        finalReport: report,
        guardsFile,
      };
      writeLoopSummary(result);
      return result;
    }

    if (regressions.length > 0) {
      const result: LoopResult = {
        status: "stopped",
        reason: `Regression in previously passing checks: ${regressions.join(", ")}`,
        workspace,
        stateDir,
        planFile: options.planPath ? path.resolve(options.planPath) : undefined,
        iterations,
        finalReport: report,
        guardsFile,
      };
      writeLoopSummary(result);
      return result;
    }

    if (signature === previousSignature && iteration > 1) {
      const result: LoopResult = {
        status: "stopped",
        reason: "No progress: the same failures repeated. Escalate to a human.",
        workspace,
        stateDir,
        planFile: options.planPath ? path.resolve(options.planPath) : undefined,
        iterations,
        finalReport: report,
        guardsFile,
      };
      writeLoopSummary(result);
      return result;
    }

    previousSignature = signature;
    previousPassing = currentPassing;
  }

  const result: LoopResult = {
    status: "failed",
    reason: `Iteration budget exhausted after ${maxIterations} attempt(s).`,
    workspace,
    stateDir,
    planFile: options.planPath ? path.resolve(options.planPath) : undefined,
    iterations,
    finalReport: lastReport,
    guardsFile,
  };
  writeLoopSummary(result);
  return result;
}

export function formatLoopResult(result: LoopResult): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`loop ${result.status}`);
  lines.push(`  ${result.reason}`);
  lines.push(`  workspace: ${result.workspace}`);
  lines.push(`  state:     ${result.stateDir}`);
  lines.push(`  iterations: ${result.iterations.length}`);
  if (result.finalReport) {
    lines.push(
      `  final score: ${result.finalReport.score}/100 · ${result.finalReport.new_failures.length} new failure(s)`,
    );
  }
  if (result.guardsFile) {
    lines.push(`  guard suggestions: ${result.guardsFile}`);
  }
  lines.push("");
  return lines.join("\n");
}
