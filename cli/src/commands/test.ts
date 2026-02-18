import { Command } from "commander";
import { testPackage } from "../lib/tester.js";
import { logger } from "../lib/logger.js";

export const testCommand = new Command("test")
  .description("Test the current package before publishing: validate manifest, render templates, check dependencies")
  .action(async () => {
    try {
      logger.blank();
      logger.bold("Testing package...");
      logger.blank();

      const result = await testPackage();

      for (const check of result.checks) {
        if (check.passed) {
          logger.success(check.name);
        } else {
          const issue = result.issues.find((i) => i.check === check.name);
          if (issue?.severity === "error") {
            logger.error(`${check.name}: ${issue.message}`);
          } else if (issue) {
            logger.warn(`${check.name}: ${issue.message}`);
          }
        }
      }

      logger.blank();
      if (result.passed) {
        logger.success(`All checks passed. Ready to publish.`);
      } else {
        const errors = result.issues.filter((i) => i.severity === "error");
        const warnings = result.issues.filter((i) => i.severity === "warning");
        logger.error(`${errors.length} error(s), ${warnings.length} warning(s). Fix errors before publishing.`);
      }
      logger.blank();

      if (!result.passed) {
        process.exit(1);
      }
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
