import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { runCheck } from "../lib/checks/run.js";
import { formatPath } from "../lib/checks/glob.js";
import { loadContract } from "../lib/judge/contract.js";
import { auditDiff } from "../lib/judge/diff.js";
import {
  buildJudgeReport,
  formatJudgeReport,
  writeJudgeArtifacts,
  writeSemanticArtifact,
} from "../lib/judge/judge.js";
import {
  buildSemanticPrompt,
  runSemanticReview,
} from "../lib/judge/semantic.js";
import { logger } from "../lib/logger.js";

interface JudgeCliOptions {
  target?: string;
  baseDir: string;
  plan?: string;
  contract?: string;
  harness?: string;
  guards?: string;
  baseline?: string;
  skipCommands?: boolean;
  rerunFailures?: boolean;
  allowUnverified?: boolean;
  judgeAgent?: string;
  judgeTimeout?: string;
  reportDir?: string;
  protect?: string;
  json?: boolean;
}

function planRelativeToTarget(
  planPath: string | undefined,
  targetDir: string,
): string | undefined {
  if (!planPath) return undefined;
  const relative = path.relative(targetDir, planPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return undefined;
  }
  return formatPath(relative);
}

export const judgeCommand = new Command("judge")
  .description(
    "Run deterministic checks plus a diff audit, then optionally a semantic reviewer",
  )
  .option("--target <dir>", "Project directory to judge", ".")
  .requiredOption(
    "--base-dir <dir>",
    "Pristine copy of the project to diff against (no git commit required)",
  )
  .option("--plan <file>", "Plan file; frontmatter may contain the contract")
  .option("--contract <file>", "Explicit contract YAML file")
  .option("--harness <path>", "Harness directory or harness.yaml")
  .option("--guards <file>", "Guards file (default: .planmode/guards.yaml)")
  .option("--baseline <file>", "Baseline JSON for delta check scoring")
  .option("--skip-commands", "Do not run verification commands")
  .option(
    "--rerun-failures",
    "Rerun failed command checks once to detect flakes",
  )
  .option(
    "--allow-unverified",
    "Allow a pass when required checks were skipped",
  )
  .option(
    "--judge-agent <command>",
    "Optional semantic reviewer command. Prompt is in $PLANMODE_JUDGE_PROMPT",
  )
  .option("--judge-timeout <seconds>", "Semantic reviewer timeout", "300")
  .option("--report-dir <dir>", "Judge artifact directory")
  .option("--protect <paths>", "Extra comma-separated protected paths")
  .option("--json", "Print the judge report as JSON")
  .action((options: JudgeCliOptions) => {
    try {
      const targetDir = path.resolve(options.target ?? ".");
      const baseDir = path.resolve(options.baseDir);
      if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        throw new Error(`Target not found: ${options.target}`);
      }
      if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
        throw new Error(`Base directory not found: ${options.baseDir}`);
      }

      const planPath = options.plan ? path.resolve(options.plan) : undefined;
      const plan = planPath ? fs.readFileSync(planPath, "utf-8") : undefined;
      const planHash = plan
        ? crypto.createHash("sha256").update(plan).digest("hex")
        : undefined;
      const contract = loadContract({
        planPath,
        contractPath: options.contract,
        projectDir: targetDir,
      });
      const judgeTimeout = options.judgeTimeout
        ? Number(options.judgeTimeout)
        : undefined;
      if (
        judgeTimeout !== undefined &&
        (!Number.isFinite(judgeTimeout) || judgeTimeout <= 0)
      ) {
        throw new Error("--judge-timeout must be a positive number of seconds");
      }
      const planRelative = planRelativeToTarget(planPath, targetDir);
      const protectedPaths = [
        ...(options.protect
          ?.split(",")
          .map((value) => value.trim())
          .filter(Boolean) ?? []),
        ...(planRelative ? [planRelative] : []),
      ];

      const reportDir = path.resolve(
        options.reportDir ?? path.join(targetDir, ".planmode", "judge"),
      );
      const report = runCheck({
        targetDir,
        harnessPath: options.harness,
        guardsPath: options.guards,
        baseDir,
        baselinePath: options.baseline,
        skipCommands: options.skipCommands,
        rerunFailures: options.rerunFailures,
        reportDir: path.join(reportDir, "check"),
        agent: "judge",
      });

      const diff = auditDiff({
        baseDir,
        targetDir,
        contract: contract?.contract,
        protectedPaths,
        excludePaths: [reportDir],
      });
      let judge = buildJudgeReport({
        check: report,
        diff,
        contract,
        planHash,
        planFile: planPath,
        allowUnverified: options.allowUnverified,
      });

      if (judge.status === "pass" && options.judgeAgent) {
        const outputFile = path.join(reportDir, "semantic-agent.json");
        const promptFile = path.join(reportDir, "SEMANTIC_PROMPT.md");
        const prompt = buildSemanticPrompt({
          plan,
          contract,
          check: report,
          diff,
          promptFile,
          outputFile,
        });
        const semantic = runSemanticReview({
          command: options.judgeAgent,
          workspace: targetDir,
          prompt,
          outputFile,
          promptFile,
          timeoutSeconds: judgeTimeout,
          excludePaths: [reportDir],
        });
        writeSemanticArtifact(semantic, reportDir);
        judge = buildJudgeReport({
          check: report,
          diff,
          contract,
          planHash,
          planFile: planPath,
          semantic,
          allowUnverified: options.allowUnverified,
        });
      }

      writeJudgeArtifacts(judge, reportDir);
      if (options.json) {
        console.log(JSON.stringify(judge, null, 2));
      } else {
        console.log(formatJudgeReport(judge));
      }

      if (judge.status !== "pass") process.exitCode = 1;
    } catch (err) {
      logger.error((err as Error).message);
      process.exitCode = 1;
    }
  });
