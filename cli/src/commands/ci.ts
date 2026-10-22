import { Command } from "commander";
import { runCi } from "../lib/ci.js";
import { logger } from "../lib/logger.js";

function printIssue(issue: ReturnType<typeof runCi>["issues"][number]): void {
  if (issue.severity === "error") {
    logger.error(issue.message);
  } else {
    logger.warn(issue.message);
  }
  if (issue.fix) logger.dim(`  ${issue.fix}`);
}

export const ciCommand = new Command("ci")
  .description("Verify a locked Planmode install in CI without network access")
  .option("--strict", "Fail on warnings as well as errors")
  .option("--json", "Output results as JSON")
  .action(async (options: { strict?: boolean; json?: boolean }) => {
    const result = runCi({ strict: options.strict });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      logger.blank();
      logger.bold(`Checking ${result.packagesChecked} locked package(s)`);
      logger.blank();

      for (const issue of result.issues) {
        printIssue(issue);
      }

      if (result.passed) {
        logger.success(
          result.issues.length === 0
            ? "Planmode install is consistent with planmode.lock."
            : "Planmode CI passed with warnings.",
        );
      } else {
        logger.error("Planmode CI failed.");
      }
      logger.blank();
    }

    if (!result.passed) {
      process.exitCode = 1;
    }
  });
