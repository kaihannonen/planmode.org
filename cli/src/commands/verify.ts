import { Command } from "commander";
import { verifyPackages, type VerificationResult } from "../lib/verifier.js";
import { logger } from "../lib/logger.js";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function indent(text: string): string {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => `  ${line}`)
    .join("\n");
}

function printResult(result: VerificationResult, verbose: boolean): void {
  logger.bold(`${result.packageName}${result.version ? `@${result.version}` : ""}`);

  for (const command of result.commands) {
    if (command.status === "passed") {
      logger.success(`${command.name} (${formatDuration(command.durationMs)})`);
      if (verbose && command.stdout.trim()) logger.dim(indent(command.stdout));
      continue;
    }

    if (command.status === "skipped") {
      logger.dim(`would run: ${command.run}`);
      continue;
    }

    const reason = command.timedOut
      ? "timed out"
      : command.exitCode !== null
        ? `exit ${command.exitCode}`
        : "failed";
    logger.error(`${command.name} (${formatDuration(command.durationMs)}, ${reason})`);

    if (command.stdout.trim()) logger.dim(indent(command.stdout));
    if (command.stderr.trim()) logger.dim(indent(command.stderr));
  }

  logger.blank();
}

export const verifyCommand = new Command("verify")
  .description("Run a plan's verification commands")
  .argument("[package]", "Installed package name (default: all installed plans or the local package)")
  .option("--dry-run", "List verification commands without running them")
  .option("--json", "Output results as JSON")
  .option("--verbose", "Show output from passing commands")
  .option("--timeout <seconds>", "Default timeout per command in seconds", "300")
  .action(
    async (
      packageName: string | undefined,
      options: { dryRun?: boolean; json?: boolean; verbose?: boolean; timeout?: string },
    ) => {
      try {
        const timeout = Number(options.timeout ?? "300");
        if (!Number.isFinite(timeout) || timeout <= 0) {
          throw new Error("--timeout must be a positive number of seconds.");
        }

        const results = await verifyPackages({
          packageName,
          dryRun: options.dryRun,
          defaultTimeout: timeout,
        });

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          logger.blank();
          logger.bold(
            options.dryRun
              ? `Verification commands for ${results.length} package(s)`
              : `Verifying ${results.length} package(s)`,
          );
          logger.blank();

          for (const result of results) {
            printResult(result, options.verbose ?? false);
          }

          const passed = results.every((result) => result.passed);
          const commandCount = results.reduce((total, result) => total + result.commands.length, 0);

          if (options.dryRun) {
            logger.info(`${commandCount} command(s) would run.`);
          } else if (passed) {
            logger.success(`All ${commandCount} verification command(s) passed.`);
          } else {
            logger.error("Verification failed.");
          }
          logger.blank();
        }

        if (results.some((result) => !result.passed)) {
          process.exitCode = 1;
        }
      } catch (err) {
        logger.error((err as Error).message);
        process.exitCode = 1;
      }
    },
  );
