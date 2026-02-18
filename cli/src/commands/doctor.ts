import { Command } from "commander";
import { runDoctor } from "../lib/doctor.js";
import { logger } from "../lib/logger.js";

export const doctorCommand = new Command("doctor")
  .description("Check project health: verify installed packages, imports, and file integrity")
  .action(() => {
    const result = runDoctor();

    logger.blank();
    logger.bold(`Checked ${result.packagesChecked} package(s)`);
    logger.blank();

    if (result.issues.length === 0) {
      logger.success("Everything looks good. No issues found.");
      logger.blank();
      return;
    }

    const errors = result.issues.filter((i) => i.severity === "error");
    const warnings = result.issues.filter((i) => i.severity === "warning");

    for (const issue of errors) {
      logger.error(issue.message);
      if (issue.fix) logger.dim(`  Fix: ${issue.fix}`);
    }
    for (const issue of warnings) {
      logger.warn(issue.message);
      if (issue.fix) logger.dim(`  Fix: ${issue.fix}`);
    }

    logger.blank();
    if (errors.length > 0) {
      logger.error(`${errors.length} error(s), ${warnings.length} warning(s)`);
    } else {
      logger.warn(`${warnings.length} warning(s)`);
    }
    logger.blank();

    if (errors.length > 0) {
      process.exit(1);
    }
  });
