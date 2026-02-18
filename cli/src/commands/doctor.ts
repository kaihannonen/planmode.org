import { Command } from "commander";
import * as p from "@clack/prompts";
import { runDoctor } from "../lib/doctor.js";
import { logger } from "../lib/logger.js";
import { isInteractive } from "../lib/prompts.js";

export const doctorCommand = new Command("doctor")
  .description("Check project health: verify installed packages, imports, and file integrity")
  .action(() => {
    const interactive = isInteractive();
    const result = runDoctor();

    if (interactive) {
      p.intro("Health check");
    } else {
      logger.blank();
    }

    if (interactive) {
      p.log.info(`Checked ${result.packagesChecked} package(s)`);
    } else {
      logger.bold(`Checked ${result.packagesChecked} package(s)`);
      logger.blank();
    }

    if (result.issues.length === 0) {
      if (interactive) {
        p.outro("Everything looks good. No issues found.");
      } else {
        logger.success("Everything looks good. No issues found.");
        logger.blank();
      }
      return;
    }

    const errors = result.issues.filter((i) => i.severity === "error");
    const warnings = result.issues.filter((i) => i.severity === "warning");

    for (const issue of errors) {
      if (interactive) {
        p.log.error(issue.message);
      } else {
        logger.error(issue.message);
        if (issue.fix) logger.dim(`  Fix: ${issue.fix}`);
      }
    }
    for (const issue of warnings) {
      if (interactive) {
        p.log.warn(issue.message);
      } else {
        logger.warn(issue.message);
        if (issue.fix) logger.dim(`  Fix: ${issue.fix}`);
      }
    }

    if (interactive) {
      if (errors.length > 0) {
        p.outro(`${errors.length} error(s), ${warnings.length} warning(s)`);
      } else {
        p.outro(`${warnings.length} warning(s)`);
      }
    } else {
      logger.blank();
      if (errors.length > 0) {
        logger.error(`${errors.length} error(s), ${warnings.length} warning(s)`);
      } else {
        logger.warn(`${warnings.length} warning(s)`);
      }
      logger.blank();
    }

    if (errors.length > 0) {
      process.exit(1);
    }
  });
