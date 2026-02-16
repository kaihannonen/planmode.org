import { Command } from "commander";
import { installPackage } from "../lib/installer.js";
import { logger } from "../lib/logger.js";

export const installCommand = new Command("install")
  .description("Install a package into the current project")
  .argument("<package>", "Package name (e.g., nextjs-tailwind-starter)")
  .option("-v, --version <version>", "Install specific version")
  .option("--rule", "Force install as a rule to .claude/rules/")
  .option("--no-input", "Fail if any required variable is missing")
  .action(
    async (
      packageName: string,
      options: { version?: string; rule?: boolean; input?: boolean },
    ) => {
      try {
        logger.blank();
        await installPackage(packageName, {
          version: options.version,
          forceRule: options.rule,
          noInput: options.input === false,
        });
        logger.blank();
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }
    },
  );
