import { Command } from "commander";
import {
  checkShouldFail,
  formatCheckReport,
  runCheck,
} from "../lib/checks/run.js";
import { logger } from "../lib/logger.js";

interface CheckCliOptions {
  harness?: string;
  target?: string;
  guards?: string;
  baseDir?: string;
  baseline?: string;
  saveBaseline?: string;
  changedOnly?: boolean;
  skipCommands?: boolean;
  rerunFailures?: boolean;
  allowUnverified?: boolean;
  writeSuggestions?: boolean;
  reportDir?: string;
  agent?: string;
  model?: string;
  json?: boolean;
  failOn?: "error" | "warn" | "never";
}

export const checkCommand = new Command("check")
  .description(
    "Run deterministic harness checks against a project. No git commit required.",
  )
  .option("--harness <path>", "Harness directory or harness.yaml")
  .option("--target <dir>", "Project directory to check", ".")
  .option("--guards <file>", "Guards file (default: .planmode/guards.yaml)")
  .option(
    "--base-dir <dir>",
    "Compare against a pristine copy of the project instead of a git base",
  )
  .option("--baseline <file>", "Baseline JSON from a previous --save-baseline run")
  .option("--save-baseline <file>", "Write a baseline after this run")
  .option("--changed-only", "Only scan files changed since the base/baseline")
  .option("--skip-commands", "Do not run verification commands")
  .option(
    "--rerun-failures",
    "Rerun failed command checks once to detect flakes",
  )
  .option(
    "--allow-unverified",
    "Exit 0 even when some required checks were skipped",
  )
  .option(
    "--write-suggestions",
    "Write deterministic guard suggestions to .planmode/guards.proposed.yaml",
  )
  .option("--report-dir <dir>", "Write report.json, PROOF.md, and guard suggestions")
  .option("--agent <id>", "Agent that produced the change (for attribution)")
  .option("--model <model>", "Model that produced the change (for attribution)")
  .option("--json", "Print the report as JSON")
  .option("--fail-on <level>", "error, warn, or never", "error")
  .action((options: CheckCliOptions) => {
    try {
      const report = runCheck({
        targetDir: options.target,
        harnessPath: options.harness,
        guardsPath: options.guards,
        baseDir: options.baseDir,
        baselinePath: options.baseline,
        saveBaselinePath: options.saveBaseline,
        changedOnly: options.changedOnly,
        skipCommands: options.skipCommands,
        rerunFailures: options.rerunFailures,
        writeSuggestions: options.writeSuggestions,
        reportDir: options.reportDir,
        agent: options.agent,
        model: options.model,
        failOn: options.failOn,
      });

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatCheckReport(report));
      }

      if (
        checkShouldFail(
          report,
          options.failOn ?? "error",
          options.allowUnverified,
        )
      ) {
        process.exitCode = 1;
      }
    } catch (err) {
      logger.error((err as Error).message);
      process.exitCode = 1;
    }
  });
