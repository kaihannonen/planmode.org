import { Command } from "commander";
import { formatLoopResult, runLoop } from "../lib/loop/loop.js";
import { logger } from "../lib/logger.js";

interface LoopCliOptions {
  plan?: string;
  agent: string;
  agentName?: string;
  target?: string;
  workspace?: string;
  harness?: string;
  guards?: string;
  maxIterations?: string;
  agentTimeout?: string;
  skipCommands?: boolean;
  allowUnverified?: boolean;
  linkDeps?: boolean;
  reportDir?: string;
  protect?: string;
  json?: boolean;
}

export const loopCommand = new Command("loop")
  .description(
    "Run an external builder in a copied workspace, verify, and stop on no progress",
  )
  .option("--plan <file>", "Plan or task description to give the builder")
  .requiredOption(
    "--agent <command>",
    "Builder command. Prompt is in $PLANMODE_PROMPT and $PLANMODE_PROMPT_FILE",
  )
  .option("--agent-name <name>", "Attribution name (claude, codex, opencode, ...)")
  .option("--target <dir>", "Project to copy", ".")
  .option("--workspace <dir>", "Use an existing workspace instead of making a copy")
  .option("--harness <path>", "Harness directory or harness.yaml")
  .option("--guards <file>", "Guards file (default: .planmode/guards.yaml)")
  .option("--max-iterations <n>", "Attempt budget", "3")
  .option("--agent-timeout <seconds>", "Per-attempt timeout", "900")
  .option("--skip-commands", "Do not run verification commands")
  .option(
    "--allow-unverified",
    "Accept a pass even when required checks were skipped",
  )
  .option(
    "--link-deps",
    "Symlink node_modules/.venv/vendor into the copied workspace so commands can run",
  )
  .option("--report-dir <dir>", "Loop state and proof directory")
  .option("--protect <paths>", "Comma-separated protected paths")
  .option("--json", "Print the loop result as JSON")
  .action((options: LoopCliOptions) => {
    try {
      const result = runLoop({
        sourceDir: options.target ?? ".",
        workspace: options.workspace,
        planPath: options.plan,
        harnessPath: options.harness,
        guardsPath: options.guards,
        agentCommand: options.agent,
        agentName: options.agentName,
        maxIterations: options.maxIterations
          ? Number(options.maxIterations)
          : undefined,
        agentTimeout: options.agentTimeout
          ? Number(options.agentTimeout)
          : undefined,
        skipCommands: options.skipCommands,
        allowUnverified: options.allowUnverified,
        linkDependencies: options.linkDeps,
        reportDir: options.reportDir,
        protectedPaths: options.protect
          ?.split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatLoopResult(result));
      }

      if (result.status !== "passed") process.exitCode = 1;
    } catch (err) {
      logger.error((err as Error).message);
      process.exitCode = 1;
    }
  });
